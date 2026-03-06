
import { Doctor, DoctorSchedule, Slot, Holiday, User } from '../types';

export class SQLiteService {
  static async initDatabase(): Promise<void> {
    // No-op for API version, but we can check health if needed
  }

  static async authenticate(username: string, pass: string): Promise<User | null> {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass })
      });
      if (res.ok) return await res.json();
    } catch (err) {
      console.error("Auth error:", err);
    }
    return null;
  }

  static async addUser(username: string, pass: string, access: number): Promise<boolean> {
    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password: pass, access })
      });
      return res.ok;
    } catch (e) {
      return false;
    }
  }

  static async getAllUsers(): Promise<User[]> {
    try {
      const res = await fetch('/api/users');
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  static async getDoctors(): Promise<Doctor[]> {
    try {
      const res = await fetch('/api/doctors');
      return await res.json();
    } catch (e) {
      return [];
    }
  }

  static async getSchedules(dateFilter?: string): Promise<Record<string, DoctorSchedule>> {
    try {
      const url = dateFilter ? `/api/schedules?date=${dateFilter}` : '/api/schedules';
      const res = await fetch(url);
      return await res.json();
    } catch (e) {
      return {};
    }
  }

  static async ensureSlotsForDate(doctorId: string, date: string): Promise<{ available: boolean; reason?: string }> {
    try {
      const res = await fetch('/api/slots/ensure', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, date })
      });
      return await res.json();
    } catch (e) {
      return { available: false, reason: 'Network error' };
    }
  }

  static async bookAppointment(doctorId: string, slotTime: string, patientName: string, patientPhone: string, patientDob: string, date?: string): Promise<{ success: boolean; message: string; slotId?: number }> {
    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ doctorId, slotTime, patientName, patientPhone, patientDob, date })
      });
      return await res.json();
    } catch (e) {
      return { success: false, message: "Network error" };
    }
  }

  static async blockSlot(slotId: string, reason: string) {
    await fetch('/api/slots/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId, reason })
    });
  }

  static async unblockSlot(slotId: string) {
    await fetch('/api/slots/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId })
    });
  }

  static async saveTranscript(slotId: number | null, patientName: string, transcript: string, existingFileName: string | null = null) {
    const res = await fetch('/api/transcripts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ slotId, patientName, transcript, existingFileName })
    });
    const data = await res.json();
    return data.fileName;
  }

  static async getTranscriptContent(fileName: string): Promise<string> {
    const res = await fetch(`/api/transcripts/${fileName}`);
    if (res.ok) {
      const data = await res.json();
      return data.content;
    }
    return "Error: File content not found.";
  }

  static async getTranscripts(): Promise<any[]> {
    const res = await fetch('/api/transcripts');
    return await res.json();
  }

  static async addHoliday(doctorId: string, holidayDate: string, reason: string = 'Vacation') {
    await fetch('/api/holidays', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId, holidayDate, reason })
    });
  }

  static async updateHoliday(id: number, holidayDate: string, reason: string) {
    await fetch(`/api/holidays/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ holidayDate, reason })
    });
  }

  static async removeHoliday(id: number) {
    await fetch(`/api/holidays/${id}`, {
      method: 'DELETE'
    });
  }

  static async getHolidays(): Promise<Holiday[]> {
    const res = await fetch('/api/holidays');
    return await res.json();
  }

  static async addOrUpdateDoctor(doctor: Doctor) {
    await fetch('/api/doctors/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(doctor)
    });
  }

  static async deleteDoctor(id: string) {
    await fetch(`/api/doctors/${id}`, {
      method: 'DELETE'
    });
  }

  static async resetSlots(doctorId: string) {
    await fetch('/api/doctors/reset-slots', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ doctorId })
    });
  }

  // Legacy/Unused in API version
  static isFileSystemSupported(): boolean { return false; }
  static async connectLocalFile(handle: any): Promise<boolean> { return false; }
  static async loadFromBlob(blob: Blob | File): Promise<boolean> { return false; }
  static exportDatabase(): Uint8Array { return new Uint8Array(); }
}
