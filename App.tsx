
import React, { useState, useEffect, useRef } from 'react';
import { Doctor, DoctorSchedule, LogMessage, User } from './types';
import { LiveAgentService } from './services/liveAgentService';
import { SQLiteService } from './db/sqliteService';
import { AppointmentGrid } from './components/AppointmentGrid';
import { AdminDashboard } from './components/AdminDashboard';
import { UserManagement } from './components/UserManagement';
import { LoginPage } from './components/LoginPage';
import { FunctionDeclaration, Type } from '@google/genai';
import { formatDisplayDate } from './utils/dateUtils';
import { 
  Phone, 
  Mic, 
  MicOff, 
  Activity, 
  AlertCircle, 
  Download, 
  FileText, 
  Stethoscope, 
  RefreshCw,
  Terminal,
  Settings,
  UserCircle,
  ShieldCheck,
  Link2,
  FileSpreadsheet,
  Unlink,
  UploadCloud,
  MessageSquare,
  Clock,
  MapPin,
  FileDown,
  Calendar,
  LogOut,
  Users
} from 'lucide-react';

const TOOLS: FunctionDeclaration[] = [
  {
    name: 'get_doctors',
    description: 'Query for medical staff based on specialty.',
    parameters: { 
      type: Type.OBJECT, 
      properties: { specialty: { type: Type.STRING } }
    }
  },
  {
    name: 'get_slots',
    description: 'Query availability for a specific doctor on a specific date (YYYY-MM-DD).',
    parameters: {
      type: Type.OBJECT,
      properties: { 
        doctor_id: { type: Type.STRING },
        date: { type: Type.STRING, description: 'Format: YYYY-MM-DD. Calculate the date from relative terms like "next Friday".' }
      },
      required: ['doctor_id']
    }
  },
  {
    name: 'book_slot',
    description: 'Commit an appointment booking. Requires date and full patient profile.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        doctor_id: { type: Type.STRING },
        slot_time: { type: Type.STRING },
        date: { type: Type.STRING, description: 'Format: YYYY-MM-DD' },
        patient_name: { type: Type.STRING },
        patient_phone: { type: Type.STRING },
        patient_dob: { type: Type.STRING, description: 'Date of Birth in YYYY-MM-DD' }
      },
      required: ['doctor_id', 'slot_time', 'date', 'patient_name', 'patient_phone', 'patient_dob']
    }
  }
];

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [view, setView] = useState<'patient' | 'admin' | 'users'>('patient');
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [schedules, setSchedules] = useState<Record<string, DoctorSchedule>>({});
  const [connected, setConnected] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncingLocal, setIsSyncingLocal] = useState(false);
  const [isFallbackMode, setIsFallbackMode] = useState(false);
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [systemLogs, setSystemLogs] = useState<LogMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{message: string, type: 'success' | 'info' | 'sms', data?: any} | null>(null);
  
  const agentRef = useRef<LiveAgentService | null>(null);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const currentPatientName = useRef<string>('');
  const currentTranscriptFileName = useRef<string | null>(null);

  const loadSQLiteData = async (date?: string) => {
    setIsRefreshing(true);
    try {
      await SQLiteService.initDatabase();
      const docs = await SQLiteService.getDoctors();
      const scheds = await SQLiteService.getSchedules(date || selectedDate);
      setDoctors(docs);
      setSchedules(scheds);
      addSystemLog(`Engine Sync: ${formatDisplayDate(date || selectedDate)}`);
    } catch (err) {
      setError("Local DB Load Failed");
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (currentUser) {
      loadSQLiteData();
    }
  }, [selectedDate, currentUser]);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs, systemLogs]);

  const handleExportCSV = () => {
    const headers = ["Patient Name", "Phone", "DOB", "Doctor", "Specialty", "Date", "Time", "Room", "Address"];
    const rows: string[][] = [];
    (Object.values(schedules) as DoctorSchedule[]).forEach(sched => {
      const doc = doctors.find(d => d.id === sched.doctorId);
      sched.slots.filter(s => s.isBooked).forEach(s => {
        rows.push([s.bookedBy || "Unknown", s.contact || "N/A", "Relational Record", doc?.name || "N/A", doc?.specialty || "N/A", formatDisplayDate(s.date), s.time, doc?.roomNo || "N/A", doc?.address || "N/A"]);
      });
    });
    if (rows.length === 0) return alert("No booked appointments to export.");
    const csvContent = [headers.join(","), ...rows.map(r => r.map(cell => `"${cell}"`).join(","))].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `Clincal_Bookings_${formatDisplayDate(selectedDate)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleSyncLocalFile = async () => {
    try {
      if (SQLiteService.isFileSystemSupported()) {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: 'SQLite DB', accept: { 'application/octet-stream': ['.db', '.sqlite'] } }]
        });
        if (handle) {
          setIsRefreshing(true);
          const success = await SQLiteService.connectLocalFile(handle);
          if (success) {
            await loadSQLiteData();
            setIsSyncingLocal(true);
            setToast({ message: "Linked to Physical DB", type: 'success' });
          }
        }
      }
    } catch (err) {} finally { setIsRefreshing(false); }
  };

  const handleLegacyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsRefreshing(true);
    try {
      const success = await SQLiteService.loadFromBlob(file);
      if (success) {
        await loadSQLiteData();
        setIsSyncingLocal(true);
        setIsFallbackMode(true);
        setToast({ message: "Local DB Restored", type: 'success' });
      }
    } finally { setIsRefreshing(false); }
  };

  const addLog = (text: string, role: 'user' | 'model', isFinal: boolean = true) => {
    const cleanedText = text.trim();
    setLogs(prev => {
      const lastMsg = prev[prev.length - 1];
      if (lastMsg && lastMsg.role === role && !lastMsg.isFinal) {
        const updated = [...prev];
        updated[updated.length - 1] = { ...lastMsg, text: cleanedText || lastMsg.text, isFinal };
        return updated;
      }
      if (!cleanedText) return prev;
      return [...prev, { role, text: cleanedText, timestamp: new Date(), isFinal }];
    });
  };

  const addSystemLog = (text: string) => {
    setSystemLogs(prev => [...prev, { role: 'system', text, timestamp: new Date(), isFinal: true }]);
  };

  const getFullTranscript = () => logs.filter(l => l.isFinal).map(l => `${l.role === 'user' ? 'PATIENT' : 'AGENT'}: ${l.text}`).join('\n');

  const savePartialTranscript = async () => {
    if (logs.length > 3) {
      const transcript = getFullTranscript();
      const fileName = await SQLiteService.saveTranscript(null, currentPatientName.current || 'Partial', transcript, currentTranscriptFileName.current);
      currentTranscriptFileName.current = fileName;
      addSystemLog(`Audit Log Recorded: ${fileName}`);
    }
  };

  const handleDownloadReport = () => {
    const dateStr = formatDisplayDate(new Date());
    let report = `CLINICAL APPOINTMENT TRANSCRIPT\n================================================\nSession Date: ${dateStr}\n================================================\n\n` + getFullTranscript();
    const blob = new Blob([report], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url, a.download = `${new Date().getTime()}_${currentPatientName.current || 'Transcript'}.txt`, a.click();
    URL.revokeObjectURL(url);
  };

  const triggerSimulatedSMS = (doctor: Doctor, patientName: string, time: string, date: string) => {
    const message = `Confirmed: Appt with ${doctor.name} on ${formatDisplayDate(date)} at ${time}. Location: ${doctor.roomNo}, ${doctor.address}. We look forward to seeing you.`;
    setToast({ type: 'sms', message: `SMS to ${patientName}`, data: { msg: message } });
    addSystemLog(`SMS sent to ${patientName} with full location details.`);
  };

  const handleToolCall = async (name: string, args: any) => {
    addSystemLog(`Executing Tool: ${name}`);
    if (args.patient_name) currentPatientName.current = args.patient_name;
    if (args.date && args.date !== selectedDate) {
      addSystemLog(`Syncing UI to requested date: ${formatDisplayDate(args.date)}`);
      setSelectedDate(args.date);
    }
    if (name === 'get_doctors') {
      const all = await SQLiteService.getDoctors();
      return args.specialty ? all.filter(d => d.specialty.toLowerCase().includes(args.specialty.toLowerCase())) : all;
    }
    if (name === 'get_slots') {
      const targetDate = args.date || selectedDate;
      const { available, reason } = await SQLiteService.ensureSlotsForDate(args.doctor_id, targetDate);
      if (!available) return { error: `Doctor unavailable on ${formatDisplayDate(targetDate)}: ${reason}` };
      const allScheds = await SQLiteService.getSchedules(targetDate);
      return allScheds[args.doctor_id]?.slots.map(s => ({ time: s.time, is_available: !s.isBooked && !s.isBlocked })) || [];
    }
    if (name === 'book_slot') {
      const res = await SQLiteService.bookAppointment(args.doctor_id, args.slot_time, args.patient_name, args.patient_phone, args.patient_dob, args.date);
      if (res.success && res.slotId) {
        const transcript = getFullTranscript();
        const fileName = await SQLiteService.saveTranscript(res.slotId, args.patient_name, transcript, currentTranscriptFileName.current);
        currentTranscriptFileName.current = fileName;
        addSystemLog(`Official Transcript Committed: ${fileName}`);
        await loadSQLiteData(args.date || selectedDate);
        const doctor = doctors.find(d => d.id === args.doctor_id);
        if (doctor) triggerSimulatedSMS(doctor, args.patient_name, args.slot_time, args.date || selectedDate);
      }
      return res;
    }
    return { error: "Unknown tool call" };
  };

  const toggleConnection = async () => {
    // Prefer runtime-injected key (Cloud Run env var via docker-entrypoint.sh),
    // fall back to build-time key (local .env via vite.config.ts).
    const apiKey = (window as any).GEMINI_API_KEY || process.env.API_KEY;
    if (connected) {
      await savePartialTranscript();
      await agentRef.current?.disconnect();
      setConnected(false);
      currentPatientName.current = "";
      currentTranscriptFileName.current = null;
    } else {
      if (!apiKey) return setError("Gemini API Key missing.");
      setLogs([]);
      currentTranscriptFileName.current = null;
      const agent = new LiveAgentService({
        apiKey: apiKey,
        onConnect: () => setConnected(true),
        onDisconnect: () => setConnected(false),
        onError: (e) => {
          setError(e.message);
          setConnected(false);
        },
        onTranscript: (text, role, isFinal) => addLog(text, role, isFinal),
        onToolCall: handleToolCall,
      });
      agentRef.current = agent;
      await agent.connect(
        `You are Athosia, clinical assistant for Upstate Medical. LISTEN FULLY. Today is ${new Date().toISOString().split("T")[0]}. Confirm Doctor, Date, Time, and Location.`,
        TOOLS,
      );
    }
  };;

  const handleLogout = () => {
    if (connected) agentRef.current?.disconnect();
    setCurrentUser(null);
    setView('patient');
  };

  if (!currentUser) {
    return <LoginPage onLogin={setCurrentUser} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row font-sans text-slate-900 overflow-hidden">
      <input type="file" ref={fileInputRef} onChange={handleLegacyFileSelect} className="hidden" accept=".db,.sqlite" />

      {toast?.type === 'sms' && (
        <div className="fixed bottom-6 right-6 z-[100] animate-slide-up w-80">
          <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-2xl border border-slate-700 relative">
            <div className="absolute top-0 left-0 w-full h-1 bg-indigo-500 animate-pulse" />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center"><MessageSquare className="w-5 h-5" /></div>
              <div><h4 className="text-[10px] font-black uppercase text-slate-400">Clinical SMS</h4><p className="text-xs font-bold">Local Messenger</p></div>
            </div>
            <div className="bg-slate-800 rounded-2xl p-4 text-xs leading-relaxed text-slate-200 border border-slate-700">{toast.data?.msg}</div>
            <button onClick={() => setToast(null)} className="mt-4 text-[10px] font-black text-indigo-400 uppercase">Dismiss</button>
          </div>
        </div>
      )}

      {toast && toast.type !== 'sms' && (
        <div className="fixed top-6 right-6 z-[60] bg-indigo-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3">
          <ShieldCheck className="w-5 h-5" /><span className="font-bold text-sm">{toast.message}</span>
        </div>
      )}

      <div className="w-full md:w-80 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0 z-10 shadow-xl">
        <div className="p-8 border-b border-slate-100 bg-indigo-600 text-white">
          <div className="flex items-center space-x-3 mb-3">
            <Stethoscope className="w-8 h-8" />          
            <h1 className="text-2xl font-black uppercase tracking-tighter">Doc Point</h1>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase opacity-80">{currentUser.username} • Access Level {currentUser.access}</span>
            </div>
          </div>
        </div>
        
        <nav className="p-4 flex-1 overflow-y-auto space-y-2">
          <button onClick={() => setView('patient')} className={`w-full p-4 rounded-2xl flex items-center gap-3 ${view === 'patient' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}>
            <UserCircle className="w-5 h-5" />Patient Portal
          </button>
          
          {currentUser.access === 1 && (
            <>
              <button onClick={() => setView('admin')} className={`w-full p-4 rounded-2xl flex items-center gap-3 ${view === 'admin' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Settings className="w-5 h-5" />Admin Dashboard
              </button>
              <button onClick={() => setView('users')} className={`w-full p-4 rounded-2xl flex items-center gap-3 ${view === 'users' ? 'bg-indigo-50 text-indigo-600 font-bold' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Users className="w-5 h-5" />User Management
              </button>
            </>
          )}
        </nav>

        <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
          <button onClick={toggleConnection} className={`w-full py-4 rounded-2xl flex items-center justify-center space-x-3 shadow-lg transition-all ${connected ? 'bg-red-500 text-white' : 'bg-indigo-600 text-white'}`}>
            {connected ? <MicOff className="w-5 h-5" /> : <Phone className="w-5 h-5" />}
            <span className="font-bold text-sm">{connected ? "Disconnect" : "Book a Slot"}</span>
          </button>
          <button onClick={handleLogout} className="w-full py-3 px-4 rounded-xl flex items-center justify-between bg-white text-red-600 border border-red-100 text-[10px] font-black uppercase hover:bg-red-50 transition-all">
            <span>Logout Session</span><LogOut className="w-3 h-3" />
          </button>
        </div>
      </div>

      <div className="flex-1 p-8 md:p-12 overflow-y-auto custom-scrollbar relative">
         <header className="mb-12 flex flex-col md:flex-row md:items-start justify-between gap-6">
            <div className="flex flex-col gap-2">
              <h2 className="text-4xl font-black text-slate-900 tracking-tighter uppercase">
                {view === 'patient' ? 'Upstate Medical' : view === 'admin' ? 'Infrastructure' : 'Authorization'}
              </h2>
              {view === 'patient' && (
                <div className="flex items-center gap-4 mt-2">
                  <div className="relative flex items-center gap-3 bg-white px-4 py-2 rounded-xl border border-slate-200 shadow-sm transition-colors group focus-within:border-indigo-500">
                    <Calendar className="w-5 h-5 text-indigo-600" />
                    <input 
                      type="date" 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)} 
                      className="bg-transparent border-none outline-none font-bold text-slate-700 cursor-pointer"
                    />
                  </div>
                  <p className="text-slate-400 text-xs font-medium">Slots for {formatDisplayDate(selectedDate)}</p>
                </div>
              )}
            </div>
            {view === 'patient' && (
              <button onClick={handleExportCSV} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-lg text-sm self-start">
                <FileDown className="w-5 h-5" /><span>Export Appointment</span>
              </button>
            )}
         </header>

         {view === 'patient' ? (
           <AppointmentGrid doctors={doctors} schedules={schedules} currentDate={selectedDate} />
         ) : view === 'admin' ? (
           <AdminDashboard 
             doctors={doctors} schedules={schedules} onUpdate={() => loadSQLiteData()} 
             onSyncLocal={handleSyncLocalFile} isSyncingLocal={isSyncingLocal} isFallbackMode={isFallbackMode}
           />
         ) : (
           <UserManagement />
         )}
      </div>
    </div>
  );
}
