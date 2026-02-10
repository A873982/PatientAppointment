
import React, { useState, useEffect } from 'react';
import { SQLiteService } from '../db/sqliteService';
import { User } from '../types';
import { UserPlus, Shield, User as UserIcon, Lock, CheckCircle2, AlertCircle } from 'lucide-react';

export const UserManagement: React.FC = () => {
  const [users, setUsers] = useState<User[]>([]);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newAccess, setNewAccess] = useState<1 | 2>(2);
  const [msg, setMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    const list = await SQLiteService.getAllUsers();
    setUsers(list);
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!newUsername || !newPassword) return;

    const success = await SQLiteService.addUser(newUsername, newPassword, newAccess);
    if (success) {
      setMsg({ text: 'User added successfully!', type: 'success' });
      setNewUsername('');
      setNewPassword('');
      loadUsers();
    } else {
      setMsg({ text: 'Username already exists or failed to add.', type: 'error' });
    }
  };

  return (
    <div className="space-y-12 animate-fade-in">
      <div className="bg-slate-900 rounded-[2.5rem] p-10 text-white shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -mr-32 -mt-32" />
        <div className="relative z-10">
          <h3 className="text-3xl font-black tracking-tight mb-2 uppercase">User Management</h3>
          <p className="text-slate-400 text-sm">Control system access levels and authorize clinical staff.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm h-fit">
          <h4 className="font-black text-slate-800 uppercase text-xs mb-8 flex items-center gap-2">Register New User</h4>
          
          <form onSubmit={handleAddUser} className="space-y-4">
            {msg && (
              <div className={`p-4 rounded-2xl text-[10px] font-black uppercase flex items-center gap-3 border ${msg.type === 'success' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                {msg.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                <span>{msg.text}</span>
              </div>
            )}
            
            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  value={newUsername}
                  onChange={e => setNewUsername(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm"
                  placeholder="e.g. JohnStaff"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Initial Password</label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm"
                  placeholder="********"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-black uppercase text-slate-400 ml-1">Access Tier</label>
              <select 
                value={newAccess} 
                onChange={e => setNewAccess(Number(e.target.value) as 1 | 2)}
                className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl outline-none font-bold text-sm"
              >
                <option value={2}>Staff (Patient Portal Only)</option>
                <option value={1}>Admin (Full Access)</option>
              </select>
            </div>

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-5 rounded-2xl font-black shadow-lg shadow-indigo-100 transition-all flex items-center justify-center gap-3">
              <UserPlus className="w-5 h-5" /> CREATE ACCOUNT
            </button>
          </form>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <h4 className="font-black text-slate-400 uppercase text-[10px] mb-2 px-2">Registered Personnel</h4>
          {users.map((u, i) => (
            <div key={i} className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center justify-between group hover:border-indigo-400 transition-all">
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${u.access === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                  {u.access === 1 ? <Shield className="w-6 h-6" /> : <UserIcon className="w-6 h-6" />}
                </div>
                <div>
                  <p className="text-sm font-black text-slate-800">{u.username}</p>
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                    {u.access === 1 ? 'Access Level 1: Administrator' : 'Access Level 2: Medical Staff'}
                  </p>
                </div>
              </div>
              <div className={`px-4 py-1.5 rounded-full text-[8px] font-black uppercase tracking-tighter ${u.access === 1 ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400'}`}>
                {u.access === 1 ? 'Full Operations' : 'Clinical Only'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
