import React, { useEffect, useState } from "react";
import { useLocation, Link, Outlet, useNavigate } from "react-router-dom";
import { FileText, Camera, PieChart, X, Sparkles } from "lucide-react";

import ExpertHubPanel, { type ExpertTab } from "../features/ai/ExpertHubPanel";
import { useUser } from "../context/user.context";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate(); // ✅ ajouté
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ExpertTab>("strategy");

  const { userData } = useUser();

  const plan = userData?.plan ?? "FREE";
  const quota = userData?.quota;

  const percentage =
    quota && quota.limit > 0 ? Math.min(100, (quota.used / quota.limit) * 100) : 0;

  const getBarColor = () => {
    if (percentage < 60) return "bg-indigo-600";
    if (percentage < 85) return "bg-amber-500";
    return "bg-red-500";
  };

  useEffect(() => {
    const onOpenExpert = () => {
      setIsChatOpen(true);
      setActiveTab("chat");
    };

    window.addEventListener("openExpertChat", onOpenExpert);
    return () => window.removeEventListener("openExpertChat", onOpenExpert);
  }, []);

  const navigation = [
    { name: "DEVIS", href: "/devis", icon: FileText, color: "bg-[#2563eb]" },
    { name: "SUIVI", href: "/vision", icon: Camera, color: "bg-[#4f46e5]" },
    { name: "COMPTA", href: "/compta", icon: PieChart, color: "bg-[#059669]" },
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

          <Link to="/dashboard" className="hover:opacity-90 transition-opacity">
            <div>
              <h1 className="text-xl font-black text-slate-900 leading-none flex items-center gap-1">
                Artisan<span className="text-[#2563eb]">Pro</span>
              </h1>

              <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                  Plan {plan}
                </span>

                {quota ? (
                  <div className="w-28">
                    <div className="flex justify-between text-[9px] text-slate-400 font-black uppercase tracking-widest">
                      <span>
                        {quota.used}/{quota.limit}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`${getBarColor()} h-full rounded-full`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                    Illimité
                  </span>
                )}
              </div>
            </div>
          </Link>
        </div>

        <div className="flex gap-2">
          <button className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50">
            ?
          </button>

          {/* ✅ MODIF UNIQUE : bouton réglages connecté */}
          <button
            onClick={() => navigate("/settings")}
            className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50"
          >
            ⚙️
          </button>
        </div>
      </header>

      {/* PAGE */}
      <main className="flex-1 overflow-y-auto relative">
        <Outlet />
      </main>

      {/* 🟦 BULLE FLOTTANTE EXPERT AI */}
      <div className="fixed bottom-24 right-6 z-[60] flex flex-col items-end gap-4">
        {isChatOpen && (
          <div className="bg-white w-[380px] max-h-[650px] rounded-[2.5rem] shadow-2xl border border-slate-100 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
            <div className="p-5 bg-slate-900 text-white flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Sparkles size={14} className="text-purple-400" />
                Mode Expert IA
              </span>
              <button
                onClick={() => setIsChatOpen(false)}
                className="p-1.5 hover:bg-white/10 rounded-xl transition-colors"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto bg-slate-50 custom-scrollbar">
              <ExpertHubPanel activeTab={activeTab} onChangeTab={setActiveTab} />
            </div>
          </div>
        )}

        <button
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={`w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-all duration-300 border-4 border-white ${
            isChatOpen
              ? "bg-slate-900 text-white rotate-90 scale-90"
              : "bg-gradient-to-tr from-purple-600 to-blue-600 text-white hover:scale-110 active:scale-95"
          }`}
          title="Mode Expert IA"
        >
          {isChatOpen ? (
            <X size={24} />
          ) : (
            <Sparkles size={24} className="animate-pulse" />
          )}
        </button>
      </div>

      {/* LE DOCK */}
      <div className="fixed bottom-6 left-4 right-4 z-50">
        <div className="bg-white shadow-2xl rounded-full px-6 py-3 flex justify-around items-center border border-slate-100">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = location.pathname === item.href;
            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                  isActive ? "scale-110" : "opacity-60 hover:opacity-100"
                }`}
              >
                <div
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg ${
                    isActive ? item.color : "bg-slate-200"
                  }`}
                >
                  <Icon
                    size={18}
                    className={isActive ? "text-white" : "text-slate-600"}
                  />
                </div>
                <span className="text-[9px] font-black text-slate-600 uppercase tracking-widest">
                  {item.name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}