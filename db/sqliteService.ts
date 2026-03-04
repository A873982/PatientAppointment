import { Doctor, DoctorSchedule, Holiday, User } from '../types';

const API_BASE = (window as any)?.API_BASE_URL || '';

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
    ...init,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

function queryParamDate(date?: string): string {
  if (!date) return '';
  return `?date=${encodeURIComponent(date)}`;
}

export class SQLiteService {
  static async initDatabase(): Promise<void> {
    await apiRequest('/api/health');
  }

  static async authenticate(username: string, pass: string): Promise<User | null> {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password: pass }),
    });
    if (response.status === 401) return null;
    if (!response.ok) {
      throw new Error(`Login request failed: ${response.status}`);
    }
    return response.json();
  }

  static async addUser(username: string, pass: string, access: number): Promise<boolean> {
    try {
      const result = await apiRequest<{ success: boolean }>('/api/users', {
        method: 'POST',
        body: JSON.stringify({ username, pass, access }),
      });
      return result.success;
    } catch (_err) {
      return false;
    }
  }

  static async getAllUsers(): Promise<User[]> {
    return apiRequest<User[]>('/api/users');
  }

  static async getDoctors(): Promise<Doctor[]> {
    return apiRequest<Doctor[]>('/api/doctors');
  }

  static async getSchedules(dateFilter?: string): Promise<Record<string, DoctorSchedule>> {
    return apiRequest<Record<string, DoctorSchedule>>(`/api/schedules${queryParamDate(dateFilter)}`);
  }

  static async ensureSlotsForDate(doctorId: string, date: string): Promise<{ available: boolean; reason?: string }> {
    return apiRequest<{ available: boolean; reason?: string }>(
      `/api/ensure-slots?doctorId=${encodeURIComponent(doctorId)}&date=${encodeURIComponent(date)}`,
    );
  }

  static async bookAppointment(
    doctorId: string,
    slotTime: string,
    patientName: string,
    patientPhone: string,
    patientDob: string,
    date?: string,
  ): Promise<{ success: boolean; message: string; slotId?: number }> {
    return apiRequest<{ success: boolean; message: string; slotId?: number }>('/api/appointments/book', {
      method: 'POST',
      body: JSON.stringify({ doctorId, slotTime, patientName, patientPhone, patientDob, date }),
    });
  }

  static async blockSlot(slotId: string, reason: string) {
    await apiRequest('/api/slots/' + encodeURIComponent(slotId) + '/block', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  static async unblockSlot(slotId: string) {
    await apiRequest('/api/slots/' + encodeURIComponent(slotId) + '/unblock', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  static async saveTranscript(slotId: number | null, patientName: string, transcript: string, existingFileName: string | null = null) {
    const result = await apiRequest<{ fileName: string }>('/api/transcripts/upsert', {
      method: 'POST',
      body: JSON.stringify({ slotId, patientName, transcript, existingFileName }),
    });
    return result.fileName;
  }

  static async getTranscriptContent(fileName: string): Promise<string> {
    const result = await apiRequest<{ content: string }>(
      `/api/transcripts/${encodeURIComponent(fileName)}/content`,
    );
    return result.content;
  }

  static async getTranscripts(): Promise<any[]> {
    return apiRequest<any[]>('/api/transcripts');
  }

  static async addHoliday(doctorId: string, holidayDate: string, reason: string = 'Vacation') {
    await apiRequest('/api/holidays', {
      method: 'POST',
      body: JSON.stringify({ doctorId, holidayDate, reason }),
    });
  }

  static async updateHoliday(id: number, holidayDate: string, reason: string) {
    await apiRequest(`/api/holidays/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ holidayDate, reason }),
    });
  }

  static async removeHoliday(id: number) {
    await apiRequest(`/api/holidays/${id}`, {
      method: 'DELETE',
    });
  }

  static async getHolidays(): Promise<Holiday[]> {
    return apiRequest<Holiday[]>('/api/holidays');
  }

  static async addOrUpdateDoctor(doctor: Doctor) {
    await apiRequest(`/api/doctors/${encodeURIComponent(doctor.id)}`, {
      method: 'PUT',
      body: JSON.stringify(doctor),
    });
  }

  static async deleteDoctor(id: string) {
    await apiRequest(`/api/doctors/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  }

  static async resetSlots(doctorId: string) {
    await apiRequest(`/api/doctors/${encodeURIComponent(doctorId)}/reset-slots`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  static async downloadDatabaseArchive(): Promise<void> {
    const payload = await apiRequest<any>('/api/admin/export-json');
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Clinical_Archive_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  static exportDatabase(): Uint8Array {
    return new Uint8Array();
  }

  static async loadFromBlob(_blob: Blob | File): Promise<boolean> {
    return false;
  }

  static async connectLocalFile(_handle: any): Promise<boolean> {
    return false;
  }

  static isFileSystemSupported(): boolean {
    return false;
  }
}
