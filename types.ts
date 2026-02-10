
export interface Doctor {
  id: string;
  name: string;
  specialty: string;
  image: string;
  availability: string; // e.g., "Mon-Fri"
  roomNo: string;      
  address: string;     
}

export interface Patient {
  id: number;
  name: string;
  dob: string;
  phone: string;
}

export interface Slot {
  id: string;
  doctorId: string;
  date: string; 
  time: string;
  isBooked: boolean;
  isBlocked?: boolean;
  blockedReason?: string;
  patientId?: number; 
  bookedBy?: string;  
  contact?: string;   
}

export interface Holiday {
  id: number;
  doctorId: string;
  doctorName?: string;
  holidayDate: string;
  reason?: string;
}

export interface DoctorSchedule {
  doctorId: string;
  date: string; // YYYY-MM-DD
  slots: Slot[];
  isHoliday?: boolean;
  holidayReason?: string;
}

export type LogMessage = {
  role: 'user' | 'model' | 'system';
  text: string;
  timestamp: Date;
  isFinal?: boolean; 
};

export interface User {
  username: string;
  access: 1 | 2; // 1 = Admin (All), 2 = Staff (Patient Portal Only)
}
