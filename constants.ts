
import { Doctor, Slot } from './types';

export const CLINIC_PHONE = "+1 478-900-3017";
export const CLINIC_HOURS = "8:00 AM - 4:00 PM";

export const DOCTORS: Doctor[] = [
  {
    id: 'dr_smith',
    name: 'Dr. Sarah Smith',
    specialty: 'Cardiologist',
    image: 'https://picsum.photos/id/64/200/200',
    availability: 'Mon-Fri',
    roomNo: 'Room 101',
    address: '123 Medical Plaza, Health City'
  },
  {
    id: 'dr_patel',
    name: 'Dr. Raj Patel',
    specialty: 'Dermatologist',
    image: 'https://picsum.photos/id/91/200/200',
    availability: 'Tue-Sat',
    roomNo: 'Room 205',
    address: '123 Medical Plaza, Health City'
  },
  {
    id: 'dr_chen',
    name: 'Dr. Emily Chen',
    specialty: 'Pediatrician',
    image: 'https://picsum.photos/id/338/200/200',
    availability: 'Mon-Thu',
    roomNo: 'Room 304',
    address: '123 Medical Plaza, Health City'
  }
];

/**
 * Generate 30-minute slots:
 * Morning: 8:00 AM - 12:00 PM
 * Afternoon: 1:00 PM - 4:00 PM
 */
export const GENERATE_DAILY_SLOTS = (doctorId: string = '', date: string = ''): Slot[] => {
  const slots: Slot[] = [];
  
  const addSlotsRange = (startHour: number, endHour: number) => {
    let currentMinutes = startHour * 60;
    const endMinutes = endHour * 60;
    
    while (currentMinutes < endMinutes) {
      const hour = Math.floor(currentMinutes / 60);
      const mins = currentMinutes % 60;
      const period = hour >= 12 ? 'PM' : 'AM';
      let displayHour = hour % 12;
      if (displayHour === 0) displayHour = 12;
      
      const hStr = displayHour.toString().padStart(2, '0');
      const mStr = mins.toString().padStart(2, '0');
      
      slots.push({
        id: `slot_${doctorId}_${date}_${currentMinutes}`,
        doctorId,
        date,
        time: `${hStr}:${mStr} ${period}`,
        isBooked: false
      });
      currentMinutes += 30;
    }
  };

  // 8:00 AM to 12:00 PM
  addSlotsRange(8, 12);
  // 1:00 PM to 4:00 PM
  addSlotsRange(13, 16);

  return slots;
};
