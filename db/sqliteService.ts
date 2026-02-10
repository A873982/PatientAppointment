
import initSqlJs from 'sql.js';
import { Doctor, DoctorSchedule, Slot, Holiday, User } from '../types';
import { DOCTORS as INITIAL_DOCTORS, GENERATE_DAILY_SLOTS } from '../constants';
import { SecurityUtils } from '../utils/securityUtils';

const CONFIG_PATH = (process as any).env?.SQLITE_DB_PATH || 'db/Clinical_database.db';
const DB_STORAGE_KEY = `sqlite_db_store_${btoa(CONFIG_PATH).slice(0, 20)}`;

export class SQLiteService {
  private static db: any = null;
  private static SQL: any = null;
  private static fileHandle: any = null;

  private static async getEngine() {
    if (this.SQL) return this.SQL;
    this.SQL = await initSqlJs({
      locateFile: (file: string) => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/${file}`
    });
    return this.SQL;
  }

  static async initDatabase(): Promise<void> {
    if (this.db) return;
    const SQL = await this.getEngine();
    const savedDb = localStorage.getItem(DB_STORAGE_KEY);
    
    if (savedDb) {
      try {
        const u8 = new Uint8Array(JSON.parse(savedDb));
        this.db = new SQL.Database(u8);
        this.createSchema(); 
        // Always attempt seeding even on existing DB to ensure 
        // default Admin/Demo users exist if table was recently added
        await this.seedInitialData();
      } catch (e) {
        await this.startFresh(SQL);
      }
    } else {
      await this.startFresh(SQL);
    }
  }

  private static async startFresh(SQL: any) {
    this.db = new SQL.Database();
    this.createSchema();
    await this.seedInitialData();
  }

  private static createSchema() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS users (
        username TEXT PRIMARY KEY,
        password TEXT,
        access INTEGER
      );
      CREATE TABLE IF NOT EXISTS doctors (
        id TEXT PRIMARY KEY,
        name TEXT,
        specialty TEXT,
        image TEXT,
        availability TEXT,
        roomNo TEXT,
        address TEXT
      );
      CREATE TABLE IF NOT EXISTS patients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        dob TEXT,
        phone TEXT UNIQUE
      );
      CREATE TABLE IF NOT EXISTS slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctorId TEXT,
        date TEXT,
        time TEXT,
        isBooked INTEGER DEFAULT 0,
        isBlocked INTEGER DEFAULT 0,
        blockedReason TEXT,
        patientId INTEGER,
        FOREIGN KEY(doctorId) REFERENCES doctors(id),
        FOREIGN KEY(patientId) REFERENCES patients(id)
      );
      CREATE TABLE IF NOT EXISTS transcripts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slotId INTEGER,
        patientName TEXT,
        fileName TEXT UNIQUE,
        filePath TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(slotId) REFERENCES slots(id)
      );
      CREATE TABLE IF NOT EXISTS file_storage (
        fileName TEXT PRIMARY KEY,
        content TEXT
      );
      CREATE TABLE IF NOT EXISTS holidays (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        doctorId TEXT,
        holidayDate TEXT,
        reason TEXT DEFAULT 'Vacation',
        FOREIGN KEY(doctorId) REFERENCES doctors(id)
      );
    `);
  }

  private static async seedInitialData() {
    // Initial Users
    const adminPass = await SecurityUtils.hashPassword('Admin@123');
    const demoPass = await SecurityUtils.hashPassword('Welcome@123');

    // INSERT OR IGNORE ensures we don't overwrite if they already exist
    this.db.run("INSERT OR IGNORE INTO users (username, password, access) VALUES (?, ?, ?)", ['Admin', adminPass, 1]);
    this.db.run("INSERT OR IGNORE INTO users (username, password, access) VALUES (?, ?, ?)", ['Demo', demoPass, 2]);

    const today = new Date().toISOString().split('T')[0];
    INITIAL_DOCTORS.forEach(doc => {
      this.db.run(`
        INSERT OR IGNORE INTO doctors (id, name, specialty, image, availability, roomNo, address) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        doc.id, doc.name, doc.specialty, doc.image, doc.availability, 
        doc.roomNo || 'Room 101', doc.address || 'Medical Center'
      ]);
      this.ensureSlotsForDate(doc.id, today);
    });
    await this.persist();
  }

  static async authenticate(username: string, pass: string): Promise<User | null> {
    // Force init check
    if (!this.db) await this.initDatabase();
    
    const hash = await SecurityUtils.hashPassword(pass);
    try {
      const res = this.db.exec("SELECT username, access FROM users WHERE username = ? AND password = ?", [username, hash]);
      if (res.length > 0 && res[0].values.length > 0) {
        return { username: res[0].values[0][0], access: res[0].values[0][1] };
      }
    } catch (err) {
      console.error("Auth query error:", err);
    }
    return null;
  }

  static async addUser(username: string, pass: string, access: number): Promise<boolean> {
    if (!this.db) await this.initDatabase();
    const hash = await SecurityUtils.hashPassword(pass);
    try {
      this.db.run("INSERT INTO users (username, password, access) VALUES (?, ?, ?)", [username, hash, access]);
      await this.persist();
      return true;
    } catch (e) {
      return false;
    }
  }

  static async getAllUsers(): Promise<User[]> {
    if (!this.db) await this.initDatabase();
    const res = this.db.exec("SELECT username, access FROM users");
    if (res.length === 0) return [];
    return res[0].values.map((v: any) => ({ username: v[0], access: v[1] }));
  }

  private static isDoctorAvailableOnDate(availability: string, dateStr: string): boolean {
    const date = new Date(dateStr);
    const day = date.getDay(); 
    const avail = availability.toLowerCase();
    if (avail.includes('mon-fri')) return day >= 1 && day <= 5;
    if (avail.includes('mon-sat')) return day >= 1 && day <= 6;
    if (avail.includes('tue-sat')) return day >= 2 && day <= 6;
    if (avail.includes('mon-sun')) return true;
    return true; 
  }

  static async ensureSlotsForDate(doctorId: string, date: string): Promise<{ available: boolean; reason?: string }> {
    if (!this.db) await this.initDatabase();
    const holidayRes = this.db.exec("SELECT reason FROM holidays WHERE doctorId = ? AND holidayDate = ?", [doctorId, date]);
    if (holidayRes.length > 0) return { available: false, reason: holidayRes[0].values[0][0] };
    const docRes = this.db.exec("SELECT availability FROM doctors WHERE id = ?", [doctorId]);
    if (!docRes.length) return { available: false, reason: 'Doctor not found' };
    const availability = docRes[0].values[0][0];
    if (!this.isDoctorAvailableOnDate(availability, date)) return { available: false, reason: 'Off Duty (Weekly Schedule)' };
    const check = this.db.exec("SELECT COUNT(*) FROM slots WHERE doctorId = ? AND date = ?", [doctorId, date]);
    if (check[0].values[0][0] === 0) {
      const slots = GENERATE_DAILY_SLOTS(doctorId, date);
      slots.forEach(slot => {
        this.db.run("INSERT INTO slots (doctorId, date, time, isBooked, isBlocked) VALUES (?, ?, ?, 0, 0)", [doctorId, date, slot.time]);
      });
      await this.persist();
    }
    return { available: true };
  }

  private static async persist() {
    if (!this.db) return;
    try {
      const binary = this.db.export();
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(Array.from(binary)));
      if (this.fileHandle) {
        const writable = await this.fileHandle.createWritable();
        await writable.write(binary);
        await writable.close();
      }
    } catch (err) {}
  }

  static async getDoctors(): Promise<Doctor[]> {
    if (!this.db) await this.initDatabase();
    const res = this.db.exec("SELECT * FROM doctors");
    if (!res.length) return [];
    const columns = res[0].columns;
    return res[0].values.map((row: any) => {
      const obj: any = {};
      columns.forEach((col: string, i: number) => obj[col] = row[i]);
      return obj as Doctor;
    });
  }

  static async getSchedules(dateFilter?: string): Promise<Record<string, DoctorSchedule>> {
    if (!this.db) await this.initDatabase();
    const today = new Date().toISOString().split('T')[0];
    const targetDate = dateFilter || today;
    const docs = await this.getDoctors();
    const schedules: Record<string, DoctorSchedule> = {};
    for (const doc of docs) {
      const { available, reason } = await this.ensureSlotsForDate(doc.id, targetDate);
      if (available) {
        const res = this.db.exec(`
          SELECT s.*, p.name as bookedBy, p.phone as contact
          FROM slots s
          LEFT JOIN patients p ON s.patientId = p.id
          WHERE s.date = ? AND s.doctorId = ?
        `, [targetDate, doc.id]);
        const slots = res.length > 0 ? res[0].values.map((row: any) => {
          const slot: any = {};
          res[0].columns.forEach((col: string, i: number) => slot[col] = row[i]);
          return {
            id: slot.id.toString(), doctorId: slot.doctorId, date: slot.date,
            time: slot.time, isBooked: !!slot.isBooked, isBlocked: !!slot.isBlocked,
            blockedReason: slot.blockedReason,
            patientId: slot.patientId,
            bookedBy: slot.bookedBy, contact: slot.contact
          };
        }) : [];
        schedules[doc.id] = { doctorId: doc.id, date: targetDate, slots, isHoliday: false };
      } else {
        schedules[doc.id] = { doctorId: doc.id, date: targetDate, slots: [], isHoliday: true, holidayReason: reason };
      }
    }
    return schedules;
  }

  static async bookAppointment(doctorId: string, slotTime: string, patientName: string, patientPhone: string, patientDob: string, date?: string): Promise<{ success: boolean; message: string; slotId?: number }> {
    const today = new Date().toISOString().split('T')[0];
    const targetDate = date || today;
    const { available, reason } = await this.ensureSlotsForDate(doctorId, targetDate);
    if (!available) return { success: false, message: `Unavailable: ${reason}` };
    const slotRes = this.db.exec("SELECT id FROM slots WHERE doctorId = ? AND time = ? AND date = ? AND isBooked = 0 AND isBlocked = 0", [doctorId, slotTime, targetDate]);
    if (!slotRes.length) return { success: false, message: "Slot unavailable or already booked." };
    const slotId = slotRes[0].values[0][0];
    this.db.run(`INSERT INTO patients (name, dob, phone) VALUES (?, ?, ?) ON CONFLICT(phone) DO UPDATE SET name=excluded.name, dob=excluded.dob`, [patientName, patientDob, patientPhone]);
    const patientId = this.db.exec("SELECT id FROM patients WHERE phone = ?", [patientPhone])[0].values[0][0];
    this.db.run(`UPDATE slots SET isBooked = 1, patientId = ? WHERE id = ?`, [patientId, slotId]);
    await this.persist();
    return { success: true, message: "Booked", slotId };
  }

  static async blockSlot(slotId: string, reason: string) {
    if (!this.db) await this.initDatabase();
    this.db.run("UPDATE slots SET isBlocked = 1, blockedReason = ? WHERE id = ? AND isBooked = 0", [reason, slotId]);
    await this.persist();
  }

  static async unblockSlot(slotId: string) {
    if (!this.db) await this.initDatabase();
    this.db.run("UPDATE slots SET isBlocked = 0, blockedReason = NULL WHERE id = ?", [slotId]);
    await this.persist();
  }

  static async saveTranscript(slotId: number | null, patientName: string, transcript: string, existingFileName: string | null = null) {
    if (!this.db) await this.initDatabase();
    const fileName = existingFileName || `${new Date().getTime()}_Transcript.txt`;
    const filePath = `Db/${fileName}`;
    if (existingFileName) {
      if (slotId !== null) {
        this.db.run("UPDATE transcripts SET slotId = ?, patientName = ? WHERE fileName = ?", [slotId, patientName, fileName]);
      } else {
        this.db.run("UPDATE transcripts SET patientName = ? WHERE fileName = ?", [patientName, fileName]);
      }
    } else {
      this.db.run("INSERT INTO transcripts (slotId, patientName, fileName, filePath) VALUES (?, ?, ?, ?)", [slotId, patientName, fileName, filePath]);
    }
    this.db.run("INSERT OR REPLACE INTO file_storage (fileName, content) VALUES (?, ?)", [fileName, transcript]);
    await this.persist();
    return fileName;
  }

  static async getTranscriptContent(fileName: string): Promise<string> {
    if (!this.db) await this.initDatabase();
    const res = this.db.exec("SELECT content FROM file_storage WHERE fileName = ?", [fileName]);
    if (res.length > 0) return res[0].values[0][0];
    return "Error: File content not found in virtual storage.";
  }

  static async getTranscripts(): Promise<any[]> {
    if (!this.db) await this.initDatabase();
    const res = this.db.exec("SELECT * FROM transcripts ORDER BY createdAt DESC");
    if (!res.length) return [];
    return res[0].values.map((row: any) => {
      const obj: any = {};
      res[0].columns.forEach((col: string, i: number) => obj[col] = row[i]);
      return obj;
    });
  }

  static async addHoliday(doctorId: string, holidayDate: string, reason: string = 'Vacation') {
    if (!this.db) await this.initDatabase();
    this.db.run("DELETE FROM slots WHERE doctorId = ? AND date = ? AND isBooked = 0", [doctorId, holidayDate]);
    this.db.run("INSERT INTO holidays (doctorId, holidayDate, reason) VALUES (?, ?, ?)", [doctorId, holidayDate, reason]);
    await this.persist();
  }

  static async updateHoliday(id: number, holidayDate: string, reason: string) {
    if (!this.db) await this.initDatabase();
    this.db.run("UPDATE holidays SET holidayDate = ?, reason = ? WHERE id = ?", [holidayDate, reason, id]);
    await this.persist();
  }

  static async removeHoliday(id: number) {
    if (!this.db) await this.initDatabase();
    this.db.run("DELETE FROM holidays WHERE id = ?", [id]);
    await this.persist();
  }

  static async getHolidays(): Promise<Holiday[]> {
    if (!this.db) await this.initDatabase();
    const res = this.db.exec("SELECT h.*, d.name as doctorName FROM holidays h JOIN doctors d ON h.doctorId = d.id ORDER BY h.holidayDate DESC");
    if (!res.length) return [];
    return res[0].values.map((row: any) => {
      const obj: any = {};
      res[0].columns.forEach((col: string, i: number) => obj[col] = row[i]);
      return obj as Holiday;
    });
  }

  static async loadFromBlob(blob: Blob | File): Promise<boolean> {
    try {
      const buffer = await blob.arrayBuffer();
      const SQL = await this.getEngine();
      if (buffer.byteLength > 0) {
        this.db = new SQL.Database(new Uint8Array(buffer));
        this.createSchema();
        await this.seedInitialData(); // Re-seed default users if missing in loaded blob
        await this.persist();
        return true;
      }
      return false;
    } catch (err) { return false; }
  }

  static async connectLocalFile(handle: any): Promise<boolean> {
    try {
      const options = { mode: 'readwrite' };
      if ((await handle.queryPermission(options)) !== 'granted') {
        if ((await handle.requestPermission(options)) !== 'granted') throw new Error("Denied");
      }
      this.fileHandle = handle;
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      const SQL = await this.getEngine();
      if (buffer.byteLength > 0) {
        this.db = new SQL.Database(new Uint8Array(buffer));
        this.createSchema();
        await this.seedInitialData(); // Ensure default users exist
      } else {
        this.db = new SQL.Database();
        this.createSchema();
        await this.seedInitialData();
      }
      await this.persist();
      return true;
    } catch (err) { return false; }
  }

  static isFileSystemSupported(): boolean {
    return typeof window !== 'undefined' && 'showOpenFilePicker' in window;
  }

  static async addOrUpdateDoctor(doctor: Doctor) {
    this.db.run(`INSERT INTO doctors (id, name, specialty, image, availability, roomNo, address) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=excluded.name, specialty=excluded.specialty, image=excluded.image, availability=excluded.availability, roomNo=excluded.roomNo, address=excluded.address`, [doctor.id, doctor.name, doctor.specialty, doctor.image, doctor.availability, doctor.roomNo, doctor.address]);
    await this.persist();
  }

  static async deleteDoctor(id: string) {
    this.db.run("DELETE FROM slots WHERE doctorId = ?", [id]);
    this.db.run("DELETE FROM holidays WHERE doctorId = ?", [id]);
    this.db.run("DELETE FROM doctors WHERE id = ?", [id]);
    await this.persist();
  }

  static async resetSlots(doctorId: string) {
    this.db.run("UPDATE slots SET isBooked = 0, isBlocked = 0, patientId = NULL, blockedReason = NULL WHERE doctorId = ?", [doctorId]);
    await this.persist();
  }

  static exportDatabase(): Uint8Array {
    return this.db.export();
  }
}
