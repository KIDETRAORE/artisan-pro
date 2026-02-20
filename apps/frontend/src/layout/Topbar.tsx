import React, { useState } from 'react';
import { useUser } from "../context/user.context";
import { useAuth } from "../store/auth.store";
import { useNavigate } from 'react-router-dom';
import { LogOut, Settings, User, ChevronDown, Bell, ShieldCheck } from 'lucide-react';

export function Topbar() {
  const { userData, clearUserData } = useUser();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  // --- Logique du Plan & Quota ---
  const plan = userData?.plan ?? "FREE";
  const quota = userData?.quota;
  const percentage = quota && quota.limit > 0
    ? Math.min((quota.used / quota.limit) * 100, 100)
    : 0;

  const getBarColor = () => {
    if (percentage < 60) return "bg-indigo-600";
    if (percentage < 85) return "bg-amber-500";
    return "bg-red-500";
  };

  // --- Logique de Déconnexion ---
  const handleLogout = async () => {
    await logout();
    clearUserData();
    navigate('/login');
  };

  const initial = userData?.name?.charAt(0).toUpperCase() || 'A';

  return (
    <header className="h-20 bg-white border-b border-slate-100 flex items-center justify-between px-8 sticky top-0 z-40">
      
      {/* LEFT SIDE: PLAN & QUOTA */}
      <div className="flex items-center gap-8">
        <div className="flex flex-col">
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 font-medium">Plan</span>
            <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md text-xs font-bold border border-blue-100 uppercase">
              {plan}
            </span>
          </div>

          {quota ? (
            <div className="w-40 mt-2">
              <div className="flex justify-between text-[10px] text-slate-400 mb-1 font-bold uppercase tracking-wider">
                <span>Usage</span>
                <span>{quota.used} / {quota.limit}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                <div
                  className={`${getBarColor()} h-full rounded-full transition-all duration-700`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold mt-1 uppercase">
              <ShieldCheck size={12} />
              <span className="tracking-tight">Usage Illimité</span>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT SIDE: NOTIFS & PROFILE */}
      <div className="flex items-center gap-6">
        {/* Notifications */}
        <button className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all relative">
          <Bell size={20} />
          <span className="absolute top-2 right-2.5 w-2 h-2 bg-red-500 rounded-full border-2 border-white"></span>
        </button>

        {/* User Menu */}
        <div className="relative">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="flex items-center gap-3 p-1 pr-2 hover:bg-slate-50 rounded-2xl transition-all border border-transparent hover:border-slate-100"
          >
            <div className="w-10 h-10 bg-slate-900 text-white rounded-xl flex items-center justify-center font-bold shadow-sm">
              {initial}
            </div>
            <div className="hidden md:block text-left">
              <p className="text-sm font-bold text-slate-900 leading-none">{userData?.name || 'Artisan'}</p>
              <p className="text-[10px] font-medium text-slate-400 mt-1 uppercase tracking-tighter">Éditer le profil</p>
            </div>
            <ChevronDown size={14} className={`text-slate-400 transition-transform duration-200 ${isMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Dropdown Menu */}
          {isMenuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setIsMenuOpen(false)}></div>
              <div className="absolute right-0 mt-3 w-52 bg-white rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 py-2 z-20 animate-in fade-in zoom-in-95 duration-200">
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                  <User size={16} />
                  <span className="text-sm font-semibold">Mon Profil</span>
                </button>
                <button className="w-full flex items-center gap-3 px-4 py-2.5 text-slate-600 hover:bg-slate-50 hover:text-blue-600 transition-colors">
                  <Settings size={16} />
                  <span className="text-sm font-semibold">Paramètres</span>
                </button>
                <div className="h-px bg-slate-50 my-1 mx-2"></div>
                <button 
                  onClick={handleLogout}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-red-500 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  <span className="text-sm font-bold">Déconnexion</span>
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}