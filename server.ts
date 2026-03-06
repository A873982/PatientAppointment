import express from 'express';
import { createServer as createViteServer } from 'vite';
import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import cors from 'cors';
import { DOCTORS as INITIAL_DOCTORS, GENERATE_DAILY_SLOTS } from './constants';
import { SecurityUtils } from './utils/securityUtils';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// MySQL connection pool
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'localhost',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || '',
  database: process.env.MYSQL_DATABASE || 'patientappointment',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

async function initDatabase() {
  const connection = await pool.getConnection();
  try {
    // Create tables
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        username VARCHAR(255) PRIMARY KEY,
        password VARCHAR(255),
        access INT
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS doctors (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        specialty VARCHAR(255),
        image TEXT,
        availability VARCHAR(255),
        roomNo VARCHAR(255),
        address TEXT
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        dob VARCHAR(255),
        phone VARCHAR(255) UNIQUE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS slots (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doctorId VARCHAR(255),
        date VARCHAR(255),
        time VARCHAR(255),
        isBooked BOOLEAN DEFAULT FALSE,
        isBlocked BOOLEAN DEFAULT FALSE,
        blockedReason TEXT,
        patientId INT,
        FOREIGN KEY(doctorId) REFERENCES doctors(id),
        FOREIGN KEY(patientId) REFERENCES patients(id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS transcripts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        slotId INT,
        patientName VARCHAR(255),
        fileName VARCHAR(255) UNIQUE,
        filePath TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY(slotId) REFERENCES slots(id)
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS file_storage (
        fileName VARCHAR(255) PRIMARY KEY,
        content LONGTEXT
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS holidays (
        id INT AUTO_INCREMENT PRIMARY KEY,
        doctorId VARCHAR(255),
        holidayDate VARCHAR(255),
        reason TEXT,
        FOREIGN KEY(doctorId) REFERENCES doctors(id)
      )
    `);

    // Seed initial data
    const [users] = await connection.query('SELECT COUNT(*) as count FROM users');
    if ((users as any)[0].count === 0) {
      const adminPass = await SecurityUtils.hashPassword('Admin@123');
      const demoPass = await SecurityUtils.hashPassword('Welcome@123');
      await connection.query('INSERT INTO users (username, password, access) VALUES (?, ?, ?)', ['Admin', adminPass, 1]);
      await connection.query('INSERT INTO users (username, password, access) VALUES (?, ?, ?)', ['Demo', demoPass, 2]);
    }

    const [doctorsCount] = await connection.query('SELECT COUNT(*) as count FROM doctors');
    if ((doctorsCount as any)[0].count === 0) {
      for (const doc of INITIAL_DOCTORS) {
        await connection.query(
          'INSERT INTO doctors (id, name, specialty, image, availability, roomNo, address) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [doc.id, doc.name, doc.specialty, doc.image, doc.availability, doc.roomNo || 'Room 101', doc.address || 'Medical Center']
        );
      }
    }

  } finally {
    connection.release();
  }
}

// Helper to ensure slots exist for a date
async function ensureSlotsForDate(doctorId: string, date: string) {
  const [holidays] = await pool.query('SELECT reason FROM holidays WHERE doctorId = ? AND holidayDate = ?', [doctorId, date]);
  if ((holidays as any[]).length > 0) return { available: false, reason: (holidays as any[])[0].reason };

  const [doc] = await pool.query('SELECT availability FROM doctors WHERE id = ?', [doctorId]);
  if (!(doc as any[]).length) return { available: false, reason: 'Doctor not found' };

  const availability = (doc as any[])[0].availability;
  if (!isDoctorAvailableOnDate(availability, date)) return { available: false, reason: 'Off Duty (Weekly Schedule)' };

  const [slotsCount] = await pool.query('SELECT COUNT(*) as count FROM slots WHERE doctorId = ? AND date = ?', [doctorId, date]);
  if ((slotsCount as any)[0].count === 0) {
    const slots = GENERATE_DAILY_SLOTS(doctorId, date);
    for (const slot of slots) {
      await pool.query('INSERT INTO slots (doctorId, date, time, isBooked, isBlocked) VALUES (?, ?, ?, FALSE, FALSE)', [doctorId, date, slot.time]);
    }
  }
  return { available: true };
}

function isDoctorAvailableOnDate(availability: string, dateStr: string): boolean {
  const date = new Date(dateStr);
  const day = date.getDay();
  const avail = availability.toLowerCase();
  if (avail.includes('mon-fri')) return day >= 1 && day <= 5;
  if (avail.includes('mon-sat')) return day >= 1 && day <= 6;
  if (avail.includes('tue-sat')) return day >= 2 && day <= 6;
  if (avail.includes('mon-sun')) return true;
  return true;
}

// API Routes
app.post('/api/auth/login', async (req, res) => {
  const { username, password } = req.body;
  const hash = await SecurityUtils.hashPassword(password);
  const [rows] = await pool.query('SELECT username, access FROM users WHERE username = ? AND password = ?', [username, hash]);
  if ((rows as any[]).length > 0) {
    res.json((rows as any[])[0]);
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/doctors', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM doctors');
  res.json(rows);
});

app.get('/api/schedules', async (req, res) => {
  const { date } = req.query;
  const targetDate = (date as string) || new Date().toISOString().split('T')[0];
  const [doctors] = await pool.query('SELECT * FROM doctors');
  const schedules: any = {};

  for (const doc of (doctors as any[])) {
    const { available, reason } = await ensureSlotsForDate(doc.id, targetDate);
    if (available) {
      const [slots] = await pool.query(`
        SELECT s.*, p.name as bookedBy, p.phone as contact, p.dob as dob
        FROM slots s
        LEFT JOIN patients p ON s.patientId = p.id
        WHERE s.date = ? AND s.doctorId = ?
      `, [targetDate, doc.id]);
      
      schedules[doc.id] = {
        doctorId: doc.id,
        date: targetDate,
        slots: (slots as any[]).map(s => ({
          ...s,
          id: s.id.toString(),
          isBooked: !!s.isBooked,
          isBlocked: !!s.isBlocked
        })),
        isHoliday: false
      };
    } else {
      schedules[doc.id] = {
        doctorId: doc.id,
        date: targetDate,
        slots: [],
        isHoliday: true,
        holidayReason: reason
      };
    }
  }
  res.json(schedules);
});

app.post('/api/slots/ensure', async (req, res) => {
  const { doctorId, date } = req.body;
  const result = await ensureSlotsForDate(doctorId, date);
  res.json(result);
});

app.post('/api/appointments/book', async (req, res) => {
  const { doctorId, slotTime, patientName, patientPhone, patientDob, date } = req.body;
  const targetDate = date || new Date().toISOString().split('T')[0];

  const { available, reason } = await ensureSlotsForDate(doctorId, targetDate);
  if (!available) return res.status(400).json({ error: `Unavailable: ${reason}` });

  const [slotRows] = await pool.query(
    'SELECT id FROM slots WHERE doctorId = ? AND time = ? AND date = ? AND isBooked = FALSE AND isBlocked = FALSE',
    [doctorId, slotTime, targetDate]
  );

  if (!(slotRows as any[]).length) return res.status(400).json({ error: 'Slot unavailable' });

  const slotId = (slotRows as any[])[0].id;

  await pool.query(
    'INSERT INTO patients (name, dob, phone) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE name=VALUES(name), dob=VALUES(dob)',
    [patientName, patientDob, patientPhone]
  );

  const [patientRows] = await pool.query('SELECT id FROM patients WHERE phone = ?', [patientPhone]);
  const patientId = (patientRows as any[])[0].id;

  await pool.query('UPDATE slots SET isBooked = TRUE, patientId = ? WHERE id = ?', [patientId, slotId]);

  res.json({ success: true, message: 'Booked', slotId });
});

app.post('/api/slots/block', async (req, res) => {
  const { slotId, reason } = req.body;
  await pool.query('UPDATE slots SET isBlocked = TRUE, blockedReason = ? WHERE id = ? AND isBooked = FALSE', [reason, slotId]);
  res.json({ success: true });
});

app.post('/api/slots/unblock', async (req, res) => {
  const { slotId } = req.body;
  await pool.query('UPDATE slots SET isBlocked = FALSE, blockedReason = NULL WHERE id = ?', [slotId]);
  res.json({ success: true });
});

app.get('/api/transcripts', async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM transcripts ORDER BY createdAt DESC');
  res.json(rows);
});

app.get('/api/transcripts/:fileName', async (req, res) => {
  const [rows] = await pool.query('SELECT content FROM file_storage WHERE fileName = ?', [req.params.fileName]);
  if ((rows as any[]).length > 0) {
    res.json({ content: (rows as any[])[0].content });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
});

app.post('/api/transcripts', async (req, res) => {
  const { slotId, patientName, transcript, existingFileName } = req.body;
  const fileName = existingFileName || `${new Date().getTime()}_Transcript.txt`;
  const filePath = `Db/${fileName}`;

  if (existingFileName) {
    if (slotId !== null) {
      await pool.query('UPDATE transcripts SET slotId = ?, patientName = ? WHERE fileName = ?', [slotId, patientName, fileName]);
    } else {
      await pool.query('UPDATE transcripts SET patientName = ? WHERE fileName = ?', [patientName, fileName]);
    }
  } else {
    await pool.query('INSERT INTO transcripts (slotId, patientName, fileName, filePath) VALUES (?, ?, ?, ?)', [slotId, patientName, fileName, filePath]);
  }
  await pool.query('INSERT INTO file_storage (fileName, content) VALUES (?, ?) ON DUPLICATE KEY UPDATE content=VALUES(content)', [fileName, transcript]);
  res.json({ fileName });
});

app.get('/api/holidays', async (req, res) => {
  const [rows] = await pool.query(`
    SELECT h.*, d.name as doctorName 
    FROM holidays h 
    JOIN doctors d ON h.doctorId = d.id 
    ORDER BY h.holidayDate DESC
  `);
  res.json(rows);
});

app.post('/api/holidays', async (req, res) => {
  const { doctorId, holidayDate, reason } = req.body;
  await pool.query('DELETE FROM slots WHERE doctorId = ? AND date = ? AND isBooked = FALSE', [doctorId, holidayDate]);
  await pool.query('INSERT INTO holidays (doctorId, holidayDate, reason) VALUES (?, ?, ?)', [doctorId, holidayDate, reason || 'Vacation']);
  res.json({ success: true });
});

app.put('/api/holidays/:id', async (req, res) => {
  const { holidayDate, reason } = req.body;
  await pool.query('UPDATE holidays SET holidayDate = ?, reason = ? WHERE id = ?', [holidayDate, reason, req.params.id]);
  res.json({ success: true });
});

app.delete('/api/holidays/:id', async (req, res) => {
  await pool.query('DELETE FROM holidays WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.get('/api/users', async (req, res) => {
  const [rows] = await pool.query('SELECT username, access FROM users');
  res.json(rows);
});

app.post('/api/users', async (req, res) => {
  const { username, password, access } = req.body;
  const hash = await SecurityUtils.hashPassword(password);
  try {
    await pool.query('INSERT INTO users (username, password, access) VALUES (?, ?, ?)', [username, hash, access]);
    res.json({ success: true });
  } catch (e) {
    res.status(400).json({ error: 'User already exists' });
  }
});

app.post('/api/doctors/update', async (req, res) => {
  const doctor = req.body;
  await pool.query(`
    INSERT INTO doctors (id, name, specialty, image, availability, roomNo, address) 
    VALUES (?, ?, ?, ?, ?, ?, ?) 
    ON DUPLICATE KEY UPDATE 
      name=VALUES(name), specialty=VALUES(specialty), image=VALUES(image), 
      availability=VALUES(availability), roomNo=VALUES(roomNo), address=VALUES(address)
  `, [doctor.id, doctor.name, doctor.specialty, doctor.image, doctor.availability, doctor.roomNo, doctor.address]);
  res.json({ success: true });
});

app.delete('/api/doctors/:id', async (req, res) => {
  await pool.query('DELETE FROM slots WHERE doctorId = ?', [req.params.id]);
  await pool.query('DELETE FROM holidays WHERE doctorId = ?', [req.params.id]);
  await pool.query('DELETE FROM doctors WHERE id = ?', [req.params.id]);
  res.json({ success: true });
});

app.post('/api/doctors/reset-slots', async (req, res) => {
  const { doctorId } = req.body;
  await pool.query('UPDATE slots SET isBooked = FALSE, isBlocked = FALSE, patientId = NULL, blockedReason = NULL WHERE doctorId = ?', [doctorId]);
  res.json({ success: true });
});

async function startServer() {
  await initDatabase();

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(console.error);
