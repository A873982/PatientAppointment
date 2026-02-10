
import { Doctor, DoctorSchedule, Slot } from '../types';
import { DOCTORS as INITIAL_DOCTORS, GENERATE_DAILY_SLOTS } from '../constants';

const DB_NAME = 'PatientAppointmentDB';
const DB_VERSION = 1;
const STORES = {
  DOCTORS: 'doctors',
  SCHEDULES: 'schedules',
  APPOINTMENTS: 'appointments'
};

export class DatabaseService {
  private static db: IDBDatabase | null = null;

  private static async getDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORES.DOCTORS)) {
          db.createObjectStore(STORES.DOCTORS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORES.SCHEDULES)) {
          db.createObjectStore(STORES.SCHEDULES, { keyPath: 'doctorId' });
        }
        if (!db.objectStoreNames.contains(STORES.APPOINTMENTS)) {
          const apptStore = db.createObjectStore(STORES.APPOINTMENTS, { keyPath: 'id', autoIncrement: true });
          apptStore.createIndex('doctorId', 'doctorId', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => reject(request.error);
    });
  }

  static async initDatabase(): Promise<void> {
    const db = await this.getDB();
    const tx = db.transaction([STORES.DOCTORS, STORES.SCHEDULES], 'readwrite');
    const doctorStore = tx.objectStore(STORES.DOCTORS);
    const scheduleStore = tx.objectStore(STORES.SCHEDULES);

    const countRequest = doctorStore.count();
    
    return new Promise((resolve) => {
      countRequest.onsuccess = () => {
        if (countRequest.result === 0) {
          console.log("SQLite: Initializing tables with default data...");
          INITIAL_DOCTORS.forEach(doc => {
            const today = new Date().toISOString().split('T')[0];
            doctorStore.add(doc);
            scheduleStore.add({
              doctorId: doc.id,
              date: today,
              // Update: pass doctorId and current date to match updated Slot interface requirements
              slots: GENERATE_DAILY_SLOTS(doc.id, today)
            });
          });
        }
        resolve();
      };
    });
  }

  static async getDoctors(): Promise<Doctor[]> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.DOCTORS, 'readonly');
      const store = tx.objectStore(STORES.DOCTORS);
      const request = store.getAll();
      request.onsuccess = () => resolve(request.result);
    });
  }

  static async getSchedules(): Promise<Record<string, DoctorSchedule>> {
    const db = await this.getDB();
    return new Promise((resolve) => {
      const tx = db.transaction(STORES.SCHEDULES, 'readonly');
      const store = tx.objectStore(STORES.SCHEDULES);
      const request = store.getAll();
      request.onsuccess = () => {
        const result: Record<string, DoctorSchedule> = {};
        request.result.forEach((sched: DoctorSchedule) => {
          result[sched.doctorId] = sched;
        });
        resolve(result);
      };
    });
  }

  static async bookAppointment(
    doctorId: string, 
    slotTime: string, 
    patientName: string, 
    patientPhone: string
  ): Promise<{ success: boolean; message: string }> {
    const db = await this.getDB();
    const tx = db.transaction([STORES.SCHEDULES, STORES.APPOINTMENTS], 'readwrite');
    const scheduleStore = tx.objectStore(STORES.SCHEDULES);
    const appointmentStore = tx.objectStore(STORES.APPOINTMENTS);

    return new Promise((resolve) => {
      const getReq = scheduleStore.get(doctorId);
      getReq.onsuccess = () => {
        const schedule: DoctorSchedule = getReq.result;
        if (!schedule) return resolve({ success: false, message: 'Doctor not found' });

        const slotIndex = schedule.slots.findIndex(s => s.time === slotTime);
        if (slotIndex === -1 || schedule.slots[slotIndex].isBooked) {
          return resolve({ success: false, message: 'Slot unavailable' });
        }

        // Update Slot
        schedule.slots[slotIndex] = {
          ...schedule.slots[slotIndex],
          isBooked: true,
          bookedBy: patientName,
          contact: patientPhone
        };

        scheduleStore.put(schedule);
        appointmentStore.add({
          doctorId,
          slotTime,
          patientName,
          patientPhone,
          timestamp: new Date().toISOString()
        });

        tx.oncomplete = () => resolve({ success: true, message: 'SQLite Transaction Successful' });
        tx.onerror = () => resolve({ success: false, message: 'SQLite Transaction Failed' });
      };
    });
  }
}
