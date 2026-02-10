
import React, { useState, useEffect, useRef } from 'react';
import { Doctor, DoctorSchedule, Holiday, Slot } from '../types';
import { SQLiteService } from '../db/sqliteService';
import { formatDisplayDate, formatDisplayDateTime } from '../utils/dateUtils';
import { 
  Plus, 
  Trash2, 
  UserPlus, 
  RefreshCcw, 
  Save, 
  X, 
  Stethoscope, 
  Settings2, 
  ShieldCheck,
  Link2,
  Download,
  Edit3,
  Calendar,
  CalendarOff,
  Umbrella,
  Search,
  CheckCircle2,
  Lock,
  Unlock,
  AlertTriangle,
  FileText,
  History,
  Clock,
  HardDrive
} from 'lucide-react';

interface AdminDashboardProps {
  doctors: Doctor[];
  schedules: Record<string, DoctorSchedule>;
  onUpdate: () => void;
  onSyncLocal: () => void;
  isSyncingLocal: boolean;
  isFallbackMode: boolean;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  doctors, 
  schedules, 
  onUpdate, 
  onSyncLocal,
  isSyncingLocal,
  isFallbackMode
}) => {
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [transcripts, setTranscripts] = useState<any[]>([]);
  const [editingHolidayId, setEditingHolidayId] = useState<number | null>(null);
  const [holidayQuery, setHolidayQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'staff' | 'holidays' | 'slots' | 'transcripts'>('staff');
  
  const [newHoliday, setNewHoliday] = useState({ doctorId: '', date: '', reason: 'Vacation' });
  const [newDoc, setNewDoc] = useState<Doctor>({
    id: '', name: '', specialty: '', image: 'https://picsum.photos/id/1/200/200',
    availability: 'Mon-Fri', roomNo: '', address: ''
  });

  const [selectedDocId, setSelectedDocId] = useState<string>('');
  const [slotOverrideDate, setSlotOverrideDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [blockReason, setBlockReason] = useState<string>('Emergency');
  const [overrideSchedule, setOverrideSchedule] = useState<DoctorSchedule | null>(null);

  useEffect(() => { 
    loadHolidays(); 
    loadTranscripts();
  }, []);

  useEffect(() => {
    if (activeTab === 'slots' && selectedDocId && slotOverrideDate) {
      loadOverrideSlots();
    }
  }, [selectedDocId, slotOverrideDate, activeTab]);

  const loadOverrideSlots = async () => {
    const scheds = await SQLiteService.getSchedules(slotOverrideDate);
    if (scheds[selectedDocId]) {
      setOverrideSchedule(scheds[selectedDocId]);
    } else {
      setOverrideSchedule(null);
    }
  };

  const loadHolidays = async () => {
    const list = await SQLiteService.getHolidays();
    setHolidays(list);
  };

  const loadTranscripts = async () => {
    const list = await SQLiteService.getTranscripts();
    setTranscripts(list);
  };

  const handleDownloadDb = () => {
    const binary = SQLiteService.exportDatabase();
    const blob = new Blob([binary], { type: 'application/x-sqlite3' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Clinical_Archive_Full.db`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSaveDoc = async () => {
    if (!newDoc.id || !newDoc.name) return;
    await SQLiteService.addOrUpdateDoctor(newDoc);
    setIsAdding(false);
    setEditingId(null);
    setNewDoc({ id: '', name: '', specialty: '', image: 'https://picsum.photos/id/1/200/200', availability: 'Mon-Fri', roomNo: '', address: '' });
    onUpdate();
  };

  const handleHolidaySubmit = async () => {
    if (!newHoliday.doctorId || !newHoliday.date) return;
    if (editingHolidayId !== null) {
      await SQLiteService.updateHoliday(editingHolidayId, newHoliday.date, newHoliday.reason);
    } else {
      await SQLiteService.addHoliday(newHoliday.doctorId, newHoliday.date, newHoliday.reason);
    }
    setNewHoliday({ doctorId: '', date: '', reason: 'Vacation' });
    setEditingHolidayId(null);
    loadHolidays();
    onUpdate();
  };

  const handleBlockSlot = async (slotId: string) => {
    await SQLiteService.blockSlot(slotId, blockReason);
    loadOverrideSlots();
    onUpdate();
  };

  const handleUnblockSlot = async (slotId: string) => {
    await SQLiteService.unblockSlot(slotId);
    loadOverrideSlots();
    onUpdate();
  };

  const handleRemoveHoliday = async (id: number) => {
    if (confirm('Remove this holiday? Slots will be regenerated for this day.')) {
      await SQLiteService.removeHoliday(id);
      loadHolidays();
      onUpdate();
    }
  };

  const handleEditDoc = (doc: Doctor) => {
    setNewDoc(doc);
    setEditingId(doc.id);
    setIsAdding(true);
    setActiveTab('staff');
  };

  const downloadTranscriptFile = async (t: any) => {
    const content = await SQLiteService.getTranscriptContent(t.fileName);
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = t.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredHolidays = holidays.filter(h => 
    h.doctorName?.toLowerCase().includes(holidayQuery.toLowerCase()) || 
    h.reason?.toLowerCase().includes(holidayQuery.toLowerCase())
  );

  return (
    <div className="space-y-12 animate-fade-in pb-24">
      {/* Infrastructure Header */}
      <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h3 className="text-3xl font-black tracking-tight mb-2 uppercase">Infrastructure Console</h3>
          <p className="text-slate-400 text-sm mb-8">Manage staff profiles, availability overrides, and relational audits.</p>
          <div className="flex flex-wrap gap-4">
            <button onClick={onSyncLocal} className={`px-8 py-4 rounded-2xl flex items-center gap-3 font-bold transition-all ${isSyncingLocal ? 'bg-emerald-500 text-white' : 'bg-white text-slate-900 hover:bg-slate-100'}`}>
              {isSyncingLocal ? <ShieldCheck className="w-5 h-5" /> : <Link2 className="w-5 h-5" />}
              {isSyncingLocal ? "Active Physical Link" : "Link Local SQLite"}
            </button>
            <button onClick={handleDownloadDb} className="px-8 py-4 rounded-2xl bg-white/10 hover:bg-white/20 text-white border border-white/10 flex items-center gap-3 font-bold transition-all">
              <Download className="w-5 h-5" /> Export DB Archive
            </button>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex flex-wrap gap-4 border-b border-slate-200 pb-2">
        <button onClick={() => setActiveTab('staff')} className={`px-6 py-3 rounded-t-2xl font-black uppercase text-xs transition-all ${activeTab === 'staff' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Medical Staff</button>
        <button onClick={() => setActiveTab('holidays')} className={`px-6 py-3 rounded-t-2xl font-black uppercase text-xs transition-all ${activeTab === 'holidays' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Holiday Registry</button>
        <button onClick={() => setActiveTab('slots')} className={`px-6 py-3 rounded-t-2xl font-black uppercase text-xs transition-all ${activeTab === 'slots' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Slot Overrides</button>
        <button onClick={() => setActiveTab('transcripts')} className={`px-6 py-3 rounded-t-2xl font-black uppercase text-xs transition-all ${activeTab === 'transcripts' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-600'}`}>Audit Logs</button>
      </div>

      {activeTab === 'staff' && (
        <section className="animate-fade-in">
          <div className="flex items-center justify-between mb-8">
             <div className="flex items-center gap-4">
               <div className="w-12 h-12 bg-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600">
                 <Stethoscope className="w-6 h-6" />
               </div>
               <div>
                 <h3 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">Staff Configuration</h3>
                 <p className="text-slate-500 text-sm">Configure primary professional profiles.</p>
               </div>
             </div>
             {!isAdding && (
               <button onClick={() => setIsAdding(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-4 rounded-2xl flex items-center gap-3 font-bold shadow-xl shadow-indigo-100 transition-all">
                 <UserPlus className="w-5 h-5" /> New Registration
               </button>
             )}
          </div>

          {isAdding && (
            <div className="bg-white border-2 border-indigo-100 rounded-[2.5rem] p-10 shadow-2xl relative mb-12">
              <div className="absolute top-0 right-0 p-6">
                 <button onClick={() => { setIsAdding(false); setEditingId(null); }} className="p-3 hover:bg-slate-100 rounded-full text-slate-400"><X className="w-6 h-6" /></button>
              </div>
              <h4 className="text-xl font-black text-slate-800 mb-8 uppercase flex items-center gap-3">Register Professional</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                <input disabled={!!editingId} value={newDoc.id} onChange={e => setNewDoc({...newDoc, id: e.target.value})} placeholder="System ID" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                <input value={newDoc.name} onChange={e => setNewDoc({...newDoc, name: e.target.value})} placeholder="Full Name" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                <input value={newDoc.specialty} onChange={e => setNewDoc({...newDoc, specialty: e.target.value})} placeholder="Specialty" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                <input value={newDoc.roomNo} onChange={e => setNewDoc({...newDoc, roomNo: e.target.value})} placeholder="Room No" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                <input value={newDoc.availability} onChange={e => setNewDoc({...newDoc, availability: e.target.value})} placeholder="Availability (Mon-Fri)" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                <input value={newDoc.address} onChange={e => setNewDoc({...newDoc, address: e.target.value})} placeholder="Full Address" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold" />
                <button onClick={handleSaveDoc} className="lg:col-span-3 bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black shadow-lg">Save Record</button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {doctors.map(doc => (
              <div key={doc.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-200 flex items-start justify-between group hover:border-indigo-400 transition-all">
                <div className="flex gap-6">
                  <img src={doc.image} className="w-20 h-20 rounded-2xl object-cover" />
                  <div>
                    <h5 className="text-xl font-black text-slate-800">{doc.name}</h5>
                    <p className="text-xs text-indigo-600 font-black uppercase tracking-widest">{doc.specialty}</p>
                    <p className="text-[10px] text-slate-400 mt-2 font-bold uppercase">{doc.availability} • {doc.roomNo}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => handleEditDoc(doc)} className="p-3 bg-slate-50 text-slate-400 hover:text-indigo-600 rounded-xl"><Edit3 className="w-4 h-4" /></button>
                  <button onClick={() => SQLiteService.resetSlots(doc.id).then(onUpdate)} className="p-3 bg-slate-50 text-slate-400 hover:text-amber-600 rounded-xl"><RefreshCcw className="w-4 h-4" /></button>
                  <button onClick={() => SQLiteService.deleteDoctor(doc.id).then(onUpdate)} className="p-3 bg-slate-50 text-slate-400 hover:text-red-600 rounded-xl"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {activeTab === 'holidays' && (
        <section className="animate-fade-in grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm h-fit">
            <h4 className="font-black text-slate-800 uppercase text-xs mb-6 flex items-center gap-2">Create Holiday Override</h4>
            <div className="space-y-4">
              <select value={newHoliday.doctorId} onChange={e => setNewHoliday({...newHoliday, doctorId: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm">
                <option value="">Select Doctor</option>
                {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <div className="relative w-full">
                <label className="text-[10px] font-black uppercase text-slate-400 ml-1 mb-1 block">Holiday Date</label>
                <input 
                  type="date" 
                  value={newHoliday.date} 
                  onChange={e => setNewHoliday({...newHoliday, date: e.target.value})} 
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" 
                />
              </div>
              <input placeholder="Reason (Emergency, Leave...)" value={newHoliday.reason} onChange={e => setNewHoliday({...newHoliday, reason: e.target.value})} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm" />
              <button onClick={handleHolidaySubmit} className="w-full bg-orange-600 hover:bg-orange-700 text-white py-4 rounded-2xl font-bold transition-all shadow-lg shadow-orange-100">Commit Holiday</button>
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4">
             {filteredHolidays.map(h => (
               <div key={h.id} className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center justify-between group">
                  <div className="flex items-center gap-4">
                     <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center text-orange-500"><Umbrella className="w-5 h-5" /></div>
                     <div>
                        <p className="text-sm font-black text-slate-800">{h.doctorName}</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase">{formatDisplayDate(h.holidayDate)} • {h.reason}</p>
                     </div>
                  </div>
                  <button onClick={() => handleRemoveHoliday(h.id)} className="p-3 text-slate-300 hover:text-red-500"><Trash2 className="w-4 h-4" /></button>
               </div>
             ))}
          </div>
        </section>
      )}

      {activeTab === 'slots' && (
        <section className="animate-fade-in space-y-8">
           <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-end mb-8">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1"><Stethoscope className="w-3 h-3" /> Select Doctor</label>
                    <select value={selectedDocId} onChange={e => setSelectedDocId(e.target.value)} className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm">
                       <option value="">Choose Physician</option>
                       {doctors.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1"><Calendar className="w-3 h-3" /> Target Date</label>
                    <input 
                      type="date" 
                      value={slotOverrideDate} 
                      onChange={e => setSlotOverrideDate(e.target.value)} 
                      className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm" 
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-400 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Block Reason</label>
                    <input value={blockReason} onChange={e => setBlockReason(e.target.value)} placeholder="Emergency Work" className="w-full px-6 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-bold outline-none text-sm" />
                 </div>
              </div>

              {selectedDocId && overrideSchedule ? (
                 <div className="space-y-6">
                    <div className="flex items-center gap-2 mb-4">
                       <div className={`w-2 h-2 rounded-full ${overrideSchedule.isHoliday ? 'bg-red-500' : 'bg-emerald-500'}`} />
                       <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                          {overrideSchedule.isHoliday ? `Full Day Holiday: ${overrideSchedule.holidayReason}` : 'Individual Slot Management'}
                       </span>
                    </div>
                    {overrideSchedule.isHoliday ? (
                       <div className="py-12 bg-red-50 rounded-3xl border border-red-100 flex flex-col items-center justify-center text-red-500">
                          <CalendarOff className="w-10 h-10 mb-2" />
                          <p className="font-bold">This doctor is on holiday on {formatDisplayDate(slotOverrideDate)}</p>
                       </div>
                    ) : (
                       <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                          {overrideSchedule.slots.map(slot => (
                             <button 
                               key={slot.id} 
                               onClick={() => slot.isBlocked ? handleUnblockSlot(slot.id) : handleBlockSlot(slot.id)}
                               disabled={slot.isBooked}
                               className={`p-4 rounded-2xl border transition-all text-center flex flex-col items-center gap-2 group relative ${
                                  slot.isBooked 
                                  ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed' 
                                  : slot.isBlocked 
                                    ? 'bg-red-50 border-red-200 text-red-600' 
                                    : 'bg-white border-slate-200 text-slate-600 hover:border-emerald-500 hover:text-emerald-600'
                               }`}
                             >
                                <span className="text-[11px] font-black">{slot.time}</span>
                                {slot.isBlocked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3 opacity-0 group-hover:opacity-100" />}
                                {slot.isBlocked && <span className="text-[8px] font-bold uppercase truncate max-w-full px-1">{slot.blockedReason}</span>}
                                {slot.isBooked && <span className="text-[8px] font-black uppercase truncate max-w-full px-1 text-slate-400">Booked</span>}
                             </button>
                          ))}
                       </div>
                    )}
                 </div>
              ) : (
                 <div className="py-20 text-center text-slate-400 italic text-sm border-2 border-dashed border-slate-100 rounded-3xl">
                    Select a physician and date to manage individual time slot availability.
                 </div>
              )}
           </div>
        </section>
      )}

      {activeTab === 'transcripts' && (
        <section className="animate-fade-in space-y-4">
           {transcripts.length === 0 ? (
             <div className="py-20 text-center bg-white rounded-[2rem] border border-dashed border-slate-200">
               <History className="w-12 h-12 text-slate-200 mx-auto mb-4" />
               <p className="text-slate-400 text-sm">No transaction audit logs found.</p>
             </div>
           ) : (
             <div className="grid grid-cols-1 gap-4">
               {transcripts.map((t, i) => (
                 <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center justify-between group hover:border-slate-400 transition-all">
                    <div className="flex items-center gap-4">
                       <div className="w-12 h-12 bg-slate-900 text-white rounded-2xl flex items-center justify-center"><FileText className="w-6 h-6" /></div>
                       <div>
                          <p className="text-sm font-black text-slate-800">{t.patientName || 'Anonymous Interaction'}</p>
                          <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{formatDisplayDateTime(t.createdAt)} • <span className="text-indigo-500 font-mono">{t.fileName}</span></p>
                          <div className="flex items-center gap-2 mt-1">
                            <HardDrive className="w-3 h-3 text-slate-300" />
                            <p className="text-[9px] text-slate-400 font-mono">{t.filePath}</p>
                            {t.slotId ? (
                               <span className="text-[8px] bg-emerald-50 text-emerald-600 px-1.5 py-0.5 rounded font-black uppercase">Slot {t.slotId}</span>
                            ) : (
                               <span className="text-[8px] bg-slate-50 text-slate-400 px-1.5 py-0.5 rounded font-black uppercase italic">Pending Booking</span>
                            )}
                          </div>
                       </div>
                    </div>
                    <button onClick={() => downloadTranscriptFile(t)} className="p-4 bg-slate-100 text-slate-600 rounded-2xl hover:bg-slate-800 hover:text-white transition-all">
                       <Download className="w-5 h-5" />
                    </button>
                 </div>
               ))}
             </div>
           )}
        </section>
      )}
    </div>
  );
};
