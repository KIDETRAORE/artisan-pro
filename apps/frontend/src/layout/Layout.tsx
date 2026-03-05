// apps/frontend/src/layout/Layout.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link, Outlet, useNavigate } from "react-router-dom";
import { FileText, Camera, PieChart, X, Sparkles } from "lucide-react";

import ExpertHubPanel, { type ExpertTab } from "../features/ai/ExpertHubPanel";
import { useUser } from "../context/user.context";
import { useAuth } from "../store/auth.store";

type DailyUsageResponse = {
  success: boolean;
  today?: { count: number; tokens: number };
};

type ExpertMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
  timestamp: Date;
};

// ✅ MODIF UNIQUE : clé localStorage canonique + clé legacy pour migration
const EXPERT_ANALYSIS_ID_KEY = "artisanpro_expert_analysis_id";
const LEGACY_EXPERT_ANALYSIS_ID_KEY = "expertAnalysisId";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ExpertTab>("strategy");

  const { userData } = useUser();
  const { accessToken } = useAuth();

  const plan = userData?.plan ?? "free";
  const status = userData?.status ?? "inactive";
  const quota = userData?.quota;

  const isPro = plan === "pro" && status === "active";

  const [dailyUsage, setDailyUsage] = useState<{ used: number; limit: number } | null>(
    null
  );

  const [expertAnalysisId, setExpertAnalysisId] = useState<string | null>(null);

  const getWelcomeMessage = useCallback((analysisId: string | null) => {
    if (analysisId) {
      return "Analyse expert activée ! Que veux-tu optimiser (TVA, charges, marge, trésorerie) ?";
    }
    return "Mode Expert IA activé. Dis-moi ce que tu veux optimiser (TVA, charges, marge, trésorerie).";
  }, []);

  const [expertMessages, setExpertMessages] = useState<ExpertMessage[]>([]);

  useEffect(() => {
    if (!accessToken) {
      setDailyUsage(null);
      return;
    }

    const API_BASE = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/$/, "")
      : "http://localhost:8080";

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/usage/daily?days=1`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const json = (await res.json()) as DailyUsageResponse;
        if (!res.ok || !json?.success) return;

        const used = Number(json?.today?.tokens ?? 0) || 0;
        const limit = quota ? Number((quota as any).limit ?? 0) || 0 : 0;

        if (limit > 0) setDailyUsage({ used, limit });
        else setDailyUsage(null);
      } catch {
        setDailyUsage(null);
      }
    })();
  }, [accessToken, quota]);

  const displayedUsed = dailyUsage?.used ?? (quota ? Number((quota as any).used ?? 0) : 0);
  const displayedLimit = dailyUsage?.limit ?? (quota ? Number((quota as any).limit ?? 0) : 0);

  const percentage =
    displayedLimit > 0 ? Math.min(100, (displayedUsed / displayedLimit) * 100) : 0;

  const getBarColor = () => {
    if (percentage < 60) return "bg-indigo-600";
    if (percentage < 85) return "bg-amber-500";
    return "bg-red-500";
  };

  const getUpgradeCtaClass = () => {
    if (isPro) return "bg-indigo-600";
    if (!quota || (quota as any).limit <= 0) return "bg-indigo-600 hover:bg-indigo-700";
    if ((quota as any).used >= (quota as any).limit)
      return "bg-red-600 hover:bg-red-700 animate-pulse";
    if (percentage >= 80) return "bg-amber-600 hover:bg-amber-700";
    return "bg-indigo-600 hover:bg-indigo-700";
  };

  // ✅ MODIF UNIQUE : recharger analysisId persisté après refresh (clé canonique + migration legacy)
  useEffect(() => {
    try {
      const persisted =
        window.localStorage.getItem(EXPERT_ANALYSIS_ID_KEY) ||
        window.localStorage.getItem(LEGACY_EXPERT_ANALYSIS_ID_KEY);

      if (persisted) {
        setExpertAnalysisId(persisted);

        // migration best-effort vers la clé canonique
        window.localStorage.setItem(EXPERT_ANALYSIS_ID_KEY, persisted);
        window.localStorage.removeItem(LEGACY_EXPERT_ANALYSIS_ID_KEY);
      }
    } catch {
      // best effort
    }
  }, []);

  // ✅ MODIF (Option B): on gère openExpertChat ICI (parent = source unique)
  useEffect(() => {
    const onOpenExpert = (event: Event) => {
      const custom = event as CustomEvent;
      const { analysisId: incomingId, message } = (custom.detail ?? {}) as {
        analysisId?: string;
        message?: string;
      };

      const nextAnalysisId = incomingId ? String(incomingId) : null;

      setIsChatOpen(true);
      setActiveTab("chat");

      // ✅ MODIF UNIQUE : set + persist localStorage (clé canonique + cleanup legacy)
      if (nextAnalysisId) {
        setExpertAnalysisId(nextAnalysisId);
        try {
          window.localStorage.setItem(EXPERT_ANALYSIS_ID_KEY, nextAnalysisId);
          window.localStorage.removeItem(LEGACY_EXPERT_ANALYSIS_ID_KEY);
        } catch {
          // best effort
        }
      }

      setExpertMessages((prev) => [
        ...prev,
        {
          id: `expert-${Date.now()}`,
          role: "assistant",
          content: message || getWelcomeMessage(nextAnalysisId),
          timestamp: new Date(),
        },
      ]);
    };

    window.addEventListener("openExpertChat", onOpenExpert);
    return () => window.removeEventListener("openExpertChat", onOpenExpert);
  }, [getWelcomeMessage]);

  // ✅ MODIF UNIQUE : on ne force PLUS un "welcome" ici (sinon ça écrase l'historique hydraté)
  // (le welcome doit être géré côté panel, ou via l'event openExpertChat)
  // useEffect(() => {
  //   if (!expertAnalysisId) return;
  //
  //   setExpertMessages((prev) => {
  //     if (prev.length > 1) return prev;
  //     return [
  //       {
  //         id: "welcome",
  //         role: "assistant",
  //         content: getWelcomeMessage(expertAnalysisId),
  //         timestamp: new Date(),
  //       },
  //     ];
  //   });
  // }, [expertAnalysisId, getWelcomeMessage]);

  const navigation = [
    { name: "DEVIS", href: "/devis", icon: FileText, color: "bg-[#2563eb]" },
    { name: "SUIVI", href: "/vision", icon: Camera, color: "bg-[#4f46e5]" },
    { name: "COMPTA", href: "/compta", icon: PieChart, color: "bg-[#059669]" },
  ];

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!settingsWrapRef.current) return;
      if (settingsWrapRef.current.contains(e.target as Node)) return;
      setIsSettingsOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const findSettingsSectionEl = (hash: string): HTMLElement | null => {
    if (!hash) return null;
    const byId = document.getElementById(hash);
    if (byId) return byId;

    const byData = document.querySelector<HTMLElement>(`[data-section="${hash}"]`);
    if (byData) return byData;

    return null;
  };

  useEffect(() => {
    if (location.pathname !== "/settings") return;

    const hash = (location.hash || "").replace("#", "");
    if (!hash) return;

    const headerOffset = 110;

    let tries = 0;
    const maxTries = 20;

    const attempt = () => {
      const el = findSettingsSectionEl(hash);
      if (el) {
        const rect = el.getBoundingClientRect();
        const top = window.scrollY + rect.top - headerOffset;
        window.scrollTo({ top, behavior: "smooth" });
        return true;
      }
      return false;
    };

    if (attempt()) return;

    const timer = window.setInterval(() => {
      tries += 1;
      if (attempt() || tries >= maxTries) {
        window.clearInterval(timer);
      }
    }, 50);

    return () => window.clearInterval(timer);
  }, [location.pathname, location.hash]);

  const goToSettingsSection = (hash: string) => {
    setIsSettingsOpen(false);
    const target = `/settings#${hash}`;

    if (location.pathname === "/settings") {
      navigate(target, { replace: false });
      return;
    }

    navigate(target);
  };

  const SettingsMenu = () => (
    <div className="absolute right-0 top-12 w-56 bg-white border border-slate-100 shadow-xl rounded-2xl overflow-hidden z-50">
      <div className="px-3 py-2 text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-50">
        Paramètres
      </div>

      <button
        type="button"
        onClick={() => goToSettingsSection("account")}
        className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        Compte
      </button>
      <button
        type="button"
        onClick={() => goToSettingsSection("subscription")}
        className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        Abonnement
      </button>

      <button
        type="button"
        onClick={() => goToSettingsSection("ai")}
        className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        IA
      </button>

      <button
        type="button"
        onClick={() => goToSettingsSection("billing")}
        className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        Facturation
      </button>
      <button
        type="button"
        onClick={() => goToSettingsSection("security")}
        className="w-full text-left px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50"
      >
        Sécurité
      </button>

      <div className="h-px bg-slate-100" />

      <button
        type="button"
        onClick={() => {
          setIsSettingsOpen(false);
          navigate("/settings");
        }}
        className="w-full text-left px-4 py-3 text-sm font-black text-slate-900 hover:bg-slate-50"
      >
        Ouvrir tous les réglages
      </button>
    </div>
  );

  return (
    <div className="flex h-screen bg-[#f8fafc] overflow-hidden flex-col font-sans relative">
      <div className="bg-[#4f46e5] text-white text-[10px] font-black py-1 flex justify-center items-center gap-2 uppercase tracking-tighter shrink-0 z-50">
        <span>⚡ Mode Direct (IA Local)</span>
      </div>

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
                  Plan {String(plan).toUpperCase()}
                </span>

                {isPro ? (
                  <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest">
                    Illimité
                  </span>
                ) : displayedLimit > 0 ? (
                  <div className="w-28">
                    <div className="flex justify-between text-[9px] text-slate-400 font-black uppercase tracking-widest">
                      <span>
                        {displayedUsed}/{displayedLimit}
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
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">
                    —
                  </span>
                )}
              </div>

              {!isPro && dailyUsage && (
                <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest mt-1">
                  IA aujourd’hui
                </div>
              )}
            </div>
          </Link>
        </div>

        <div className="flex gap-2 items-center">
          {!isPro && (
            <Link
              to="/upgrade"
              className={`px-3 py-2 rounded-xl text-white text-xs font-bold uppercase tracking-widest transition-colors ${getUpgradeCtaClass()}`}
            >
              Passer PRO
            </Link>
          )}

          <button className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50">
            ?
          </button>

          <div className="relative" ref={settingsWrapRef}>
            <button
              onClick={() => setIsSettingsOpen((v) => !v)}
              className="w-10 h-10 rounded-full border border-slate-100 flex items-center justify-center text-slate-400 hover:bg-slate-50"
              aria-haspopup="menu"
              aria-expanded={isSettingsOpen}
              aria-label="Réglages"
            >
              ⚙️
            </button>

            {isSettingsOpen && <SettingsMenu />}
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto relative pb-32">
        <Outlet />
      </main>

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
              <ExpertHubPanel
                activeTab={activeTab}
                onChangeTab={setActiveTab}
                analysisId={expertAnalysisId}
                messages={expertMessages}
                setMessages={setExpertMessages}
                setAnalysisId={setExpertAnalysisId}
              />
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
          {isChatOpen ? <X size={24} /> : <Sparkles size={24} className="animate-pulse" />}
        </button>
      </div>

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
                  <Icon size={18} className={isActive ? "text-white" : "text-slate-600"} />
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