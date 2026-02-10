import React from 'react';
import { Doctor, DoctorSchedule, Slot } from '../types';
import { CalendarOff, Clock, Coffee, AlertTriangle } from 'lucide-react';
import { formatDisplayDate } from '../utils/dateUtils';

interface AppointmentGridProps {
  doctors: Doctor[];
  schedules: Record<string, DoctorSchedule>;
  currentDate: string;
}

export const AppointmentGrid: React.FC<AppointmentGridProps> = ({ doctors, schedules, currentDate }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {doctors.map(doctor => {
        const schedule = schedules[doctor.id];
        const slots = schedule ? schedule.slots : [];
        const bookedCount = slots.filter(s => s.isBooked || s.isBlocked).length;
        const isHoliday = schedule?.isHoliday;

        // Split slots into Morning and Afternoon for UI separation
        const morningSlots = slots.filter(s => {
          const hour = parseInt(s.time.split(':')[0]);
          const isAM = s.time.includes('AM') || (hour === 12 && s.time.includes('PM') === false);
          const isNoon = hour === 12 && s.time.includes('PM');
          return isAM && !isNoon;
        });
        
        const afternoonSlots = slots.filter(s => s.time.includes('PM') && parseInt(s.time.split(':')[0]) !== 12);

        return (
          <div key={doctor.id} className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden flex flex-col group hover:shadow-xl hover:border-indigo-200 transition-all">
            <div className="p-5 bg-slate-50 border-b border-slate-100 flex items-center space-x-4">
              <div className="relative">
                <img src={doctor.image} alt={doctor.name} className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm" />
                <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-white ${isHoliday ? 'bg-red-600 animate-pulse' : 'bg-emerald-400'}`} />
              </div>
              <div>
                <h3 className={`font-black tracking-tight ${isHoliday ? 'text-red-600' : 'text-slate-800'}`}>{doctor.name}</h3>
                <p className={`text-[10px] font-black uppercase tracking-widest ${isHoliday ? 'text-red-500' : 'text-indigo-600'}`}>{doctor.specialty}</p>
              </div>
            </div>
            
            <div className="p-5 flex-1 bg-white">
              {isHoliday ? (
                <div className="h-full flex flex-col items-center justify-center py-16 text-center animate-fade-in">
                   <div className="w-16 h-16 bg-red-50 rounded-3xl flex items-center justify-center text-red-600 mb-4">
                     <CalendarOff className="w-8 h-8" />
                   </div>
                   <h4 className="text-sm font-black text-red-600 uppercase">Doctor Unavailable</h4>
                   <p className="text-xs text-red-500 mt-2 font-medium max-w-[150px]">{schedule.holidayReason || 'Out of Office'}</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Active Slots</span>
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg uppercase ${slots.length - bookedCount > 0 ? 'text-emerald-600 bg-emerald-50' : 'text-slate-400 bg-slate-100'}`}>
                      {slots.length - bookedCount} Available
                    </span>
                  </div>
                  
                  <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1 custom-scrollbar">
                    {/* Morning Section */}
                    <div className="grid grid-cols-2 gap-2">
                      {morningSlots.map((slot) => (
                        <SlotButton key={slot.id} slot={slot} />
                      ))}
                    </div>

                    {/* Lunch Break UI */}
                    <div className="py-3 px-4 bg-amber-50 rounded-2xl border border-amber-100 flex items-center justify-center gap-3 text-amber-700 my-2">
                      
                      <span className="text-[10px] font-black uppercase tracking-widest">Lunch Break (12:00 to 1:00)</span>
                    </div>

                    {/* Afternoon Section */}
                    <div className="grid grid-cols-2 gap-2">
                      {afternoonSlots.map((slot) => (
                        <SlotButton key={slot.id} slot={slot} />
                      ))}
                    </div>

                    {slots.length === 0 && (
                      <div className="py-10 text-center text-xs text-slate-300 font-medium italic">
                        No working hours defined.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="p-4 bg-slate-50 text-center border-t border-slate-100 flex items-center justify-center gap-2">
              <Clock className="w-3 h-3 text-slate-300" />
              <span className={`text-[10px] font-black uppercase tracking-widest ${isHoliday ? 'text-red-600' : 'text-slate-400'}`}>{formatDisplayDate(currentDate)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const SlotButton: React.FC<{ slot: Slot }> = ({ slot }) => (
  <div 
    className={`
      text-[11px] p-3 rounded-xl text-center font-bold transition-all border
      ${slot.isBooked 
        ? 'bg-red-50 text-red-600 cursor-not-allowed border-red-200' 
        : slot.isBlocked
          ? 'bg-slate-100 text-red-600 cursor-not-allowed border-slate-200 opacity-70'
          : 'bg-white text-slate-600 border-slate-100 hover:border-indigo-300 hover:text-indigo-600 hover:bg-indigo-50/30'}
    `}
  >
     <span className={slot.isBooked || slot.isBlocked ? 'text-red-600' : ''}>
       {slot.time}
     </span>
     {slot.isBooked && (
       <div className="text-[9px] mt-1 text-red-600 truncate font-black">
         {slot.bookedBy || 'Busy'}
       </div>
     )}
     {slot.isBlocked && !slot.isBooked && (
       <div className="text-[9px] mt-1 text-red-600 flex items-center justify-center gap-1 font-black">
         <AlertTriangle className="w-2 h-2" /> {slot.blockedReason || 'Blocked'}
       </div>
     )}
  </div>
);
