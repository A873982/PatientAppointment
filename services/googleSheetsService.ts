
import { Doctor, DoctorSchedule, Slot } from '../types';
import { DOCTORS as DEFAULT_DOCTORS, GENERATE_DAILY_SLOTS } from '../constants';

/**
 * Service for Google Sheets integration.
 * For production, set GOOGLE_SCRIPT_URL to your deployed Google Apps Script Web App.
 */
const GOOGLE_SCRIPT_URL = ''; 

export class GoogleSheetsService {
  private static STORAGE_KEY = 'patient_appt_google_sheet_mock';

  static async getClinicData(): Promise<{ doctors: Doctor[], schedules: Record<string, DoctorSchedule> }> {
    if (GOOGLE_SCRIPT_URL) {
      try {
        const response = await fetch(`${GOOGLE_SCRIPT_URL}?action=getData`);
        return await response.json();
      } catch (error) {
        console.warn("Sheet sync failed, falling back to local state.");
      }
    }

    const stored = localStorage.getItem(this.STORAGE_KEY);
    if (stored) return JSON.parse(stored);

    const today = new Date().toISOString().split('T')[0];
    const initialSchedules: Record<string, DoctorSchedule> = {};
    DEFAULT_DOCTORS.forEach(doc => {
      initialSchedules[doc.id] = {
        doctorId: doc.id,
        date: today,
        // Update: pass doctorId and today to satisfy updated Slot requirements
        slots: GENERATE_DAILY_SLOTS(doc.id, today)
      };
    });

    const data = { doctors: DEFAULT_DOCTORS, schedules: initialSchedules };
    this.saveData(data);
    return data;
  }

  static async bookAppointment(
    doctorId: string, 
    slotTime: string, 
    patientName: string, 
    patientPhone: string
  ): Promise<{ success: boolean, message: string }> {
    if (GOOGLE_SCRIPT_URL) {
      try {
        const response = await fetch(GOOGLE_SCRIPT_URL, {
          method: 'POST',
          body: JSON.stringify({ action: 'book', doctorId, slot_time: slotTime, patientName, patientPhone })
        });
        return await response.json();
      } catch (error) {
        console.error("Sheet booking failed.");
      }
    }

    const data = await this.getClinicData();
    const schedule = data.schedules[doctorId];
    const slotIndex = schedule?.slots.findIndex(s => s.time === slotTime);

    if (slotIndex !== -1 && !schedule.slots[slotIndex].isBooked) {
      schedule.slots[slotIndex] = {
        ...schedule.slots[slotIndex],
        isBooked: true,
        bookedBy: patientName,
        contact: patientPhone
      };
      this.saveData(data);
      return { success: true, message: "Sheet record updated successfully." };
    }
    return { success: false, message: "Slot unavailable." };
  }

  private static saveData(data: any) {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
  }
}
