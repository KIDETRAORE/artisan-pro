import React, { useState } from 'react';
import { useEffect } from "react";
import { useLocation, Link, Outlet } from 'react-router-dom';
import { FileText, Camera, PieChart, MessageSquare, X, Sparkles } from 'lucide-react';
// 🔥 Import du nouveau composant expert
import AiModePanel from "../features/ai/AiModePanel";
import { useExpertAssistantStore } from "../features/ai/expertAssistant.store";

export default function Layout() {
  const location = useLocation();
  const [isChatOpen, setIsChatOpen] = useState(false);

  const payload = useExpertAssistantStore((s) => s.payload);

  useEffect(() => {
    if (payload) {
      setIsChatOpen(true);
    }
  }, [payload]);

  const navigation = [
    { name: 'DEVIS', href: '/devis', icon: FileText, color: 'bg-[#2563eb]' },
    { name: 'SUIVI', href: '/vision', icon: Camera, color: 'bg-[#4f46e5]' },
    { name: 'COMPTA', href: '/compta', icon: PieChart, color: 'bg-[#059669]' },
  ];

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden flex-col font-sans relative">
      
      {/* BANDEAU TOP IA LOCAL */}
      <div className="bg-[#4f46e5] text-white text-[10px] font-black py-1 flex justify-center items-center gap-2 uppercase tracking-tighter shrink-0 z-50">
        <span>⚡ Mode Direct (IA Local)</span>
      </div>

      {/* TOPBAR BLANCHE */}
      <header className="bg-white px-6 py-4 flex justify-between items-center shadow-sm border-b border-slate-100 shrink-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#2563eb] rounded-full flex items-center justify-center text-white shadow-lg">
              <span className="text-lg">🛠️</span>
          </div>

          {/* ✅ MODIFICATION : logo cliquable vers /dashboard */}
          <Link to="/dashboard">
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-none flex items-center gap-1 hover:opacity-90 transition-opacity">
                Artisan<span className="text-[#2563eb]">Pro</span>
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <div className="w-12 h-1.5 bg-slate-100 rounded-full"></div>
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Mode Illimité
                </span>
              </div>
            </div>
          </Link>
        </div>

        <div className="flex gap-2">
          <button className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50">?</button>
          <button className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50">⏻</button>
        </div>
      </header>

      {/* CONTENU PRINCIPAL */}
      <main className="flex-1 overflow-hidden p-4 pb-24 relative">
        <Outlet />
      </main>

      {/* 🟦 BULLE FLOTTANTE EXPERT AI (PHASE 5) */}
      <div className="fixed bottom-24 right-6 z-[60] flex flex-col items-end gap-4">
        {isChatOpen && (
          <div className="bg-white w-[350px] max-h-[600px] rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Sparkles size={14} className="text-purple-400" /> Mode Expert Stratégique
              </span>
              <button 
                onClick={() => setIsChatOpen(false)} 
                className="p-1.5 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
              <AiModePanel />
            </div>
          </div>
        )}
        
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 border-4 border-white ${
            isChatOpen 
              ? 'bg-slate-900 text-white rotate-90 scale-90' 
              : 'bg-gradient-to-tr from-purple-600 to-blue-600 text-white hover:scale-110 active:scale-95'
          }`}
        >
          {isChatOpen ? <X size={24} /> : <Sparkles size={24} className="animate-pulse" />}
        </button>
      </div>

      {/* LE DOCK (NAV BAR) */}
      <div className="fixed bottom-6 left-4 right-4 flex justify-center pointer-events-none z-50">
        <nav className="bg-white/95 backdrop-blur-md rounded-[3rem] p-1.5 flex items-center gap-1 shadow-2xl border border-white/50 pointer-events-auto min-w-[300px] justify-between">
          {navigation.map((item) => {
            const isActive = location.pathname === item.href;
            return (
              <Link 
                key={item.name} 
                to={item.href} 
                className={`flex flex-col items-center justify-center transition-all duration-500 ${
                  isActive 
                    ? `${item.color} text-white px-7 py-3 rounded-[2.5rem] shadow-lg` 
                    : 'text-slate-400 px-5 py-2 hover:text-slate-600'
                }`}
              >
                <item.icon size={isActive ? 18 : 22} strokeWidth={isActive ? 3 : 2} />
                {isActive && (
                  <span className="text-[9px] font-black mt-1 tracking-[0.15em]">
                    {item.name}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}