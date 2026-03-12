// apps/frontend/src/layout/Layout.tsx
import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, Link, Outlet, useNavigate } from "react-router-dom";
import { Home, X, Sparkles, Palette, UserRound } from "lucide-react";

import ExpertHubPanel, { type ExpertTab } from "../features/ai/ExpertHubPanel";
import { useUser } from "../context/user.context";
import { useAuth } from "../store/auth.store";
import { useComptaReportStore } from "../store/comptaReport.store";
import {
  useUIThemeStore,
  type UITheme,
  UI_THEME_LABELS,
} from "../store/uiTheme.store";
import {
  useUIExperienceStore,
  type UIExperienceMode,
  UI_EXPERIENCE_LABELS,
} from "../store/uiExperience.store";

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

const EXPERT_ANALYSIS_ID_KEY = "artisanpro_expert_analysis_id";
const LEGACY_EXPERT_ANALYSIS_ID_KEY = "expertAnalysisId";

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ExpertTab>("chat");

  const { userData } = useUser();
  const { accessToken } = useAuth();
  const setComptaReport = useComptaReportStore((s) => s.setReport);

  const { theme, setTheme } = useUIThemeStore();
  const { mode, setMode } = useUIExperienceStore();
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);
  const themeWrapRef = useRef<HTMLDivElement | null>(null);

  const plan = userData?.plan ?? "free";
  const status = userData?.status ?? "inactive";
  const quota = userData?.quota;

  const isPro = plan === "pro" && status === "active";

  const [dailyUsage, setDailyUsage] = useState<{
    used: number;
    limit: number;
  } | null>(null);

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

  useEffect(() => {
    if (!accessToken) {
      return;
    }

    const API_BASE = import.meta.env.VITE_API_URL
      ? import.meta.env.VITE_API_URL.replace(/\/$/, "")
      : "http://localhost:8080";

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/ai/compta/latest`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        const json = (await res.json()) as { report?: unknown };

        if (!res.ok || !json?.report) {
          return;
        }

        setComptaReport(json.report as any);
      } catch {
        // best effort
      }
    })();
  }, [accessToken, setComptaReport]);

  const displayedUsed =
    dailyUsage?.used ?? (quota ? Number((quota as any).used ?? 0) : 0);
  const displayedLimit =
    dailyUsage?.limit ?? (quota ? Number((quota as any).limit ?? 0) : 0);

  const percentage =
    displayedLimit > 0
      ? Math.min(100, (displayedUsed / displayedLimit) * 100)
      : 0;

  const getBarColor = () => {
    if (percentage < 60) return "bg-indigo-600";
    if (percentage < 85) return "bg-amber-500";
    return "bg-red-500";
  };

  const getUpgradeCtaClass = () => {
    if (isPro) return "bg-indigo-600";
    if (!quota || (quota as any).limit <= 0)
      return "bg-indigo-600 hover:bg-indigo-700";
    if ((quota as any).used >= (quota as any).limit)
      return "bg-red-600 hover:bg-red-700 animate-pulse";
    if (percentage >= 80) return "bg-amber-600 hover:bg-amber-700";
    return "bg-indigo-600 hover:bg-indigo-700";
  };

  useEffect(() => {
    try {
      const persisted =
        window.localStorage.getItem(EXPERT_ANALYSIS_ID_KEY) ||
        window.localStorage.getItem(LEGACY_EXPERT_ANALYSIS_ID_KEY);

      if (persisted) {
        setExpertAnalysisId(persisted);
        window.localStorage.setItem(EXPERT_ANALYSIS_ID_KEY, persisted);
        window.localStorage.removeItem(LEGACY_EXPERT_ANALYSIS_ID_KEY);
      }
    } catch {
      // best effort
    }
  }, []);

  useEffect(() => {
    try {
      if (expertAnalysisId) {
        window.localStorage.setItem(EXPERT_ANALYSIS_ID_KEY, expertAnalysisId);
        window.localStorage.removeItem(LEGACY_EXPERT_ANALYSIS_ID_KEY);
      } else {
        window.localStorage.removeItem(EXPERT_ANALYSIS_ID_KEY);
        window.localStorage.removeItem(LEGACY_EXPERT_ANALYSIS_ID_KEY);
      }
    } catch {
      // best effort
    }
  }, [expertAnalysisId]);

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

  const navigation = [
    {
      name: "ACCUEIL",
      href: "/dashboard",
      icon: Home,
      matches: (pathname: string) =>
        pathname === "/dashboard" ||
        pathname.startsWith("/dashboard") ||
        pathname.startsWith("/projects") ||
        pathname.startsWith("/compta"),
    },
    {
      name: "ACTIONS",
      href: "/assistant",
      icon: Sparkles,
      matches: (pathname: string) =>
        pathname === "/assistant" ||
        pathname.startsWith("/devis") ||
        pathname.startsWith("/vision") ||
        pathname.startsWith("/sales-invoices") ||
        pathname.startsWith("/purchase-bills") ||
        pathname.startsWith("/payments") ||
        pathname.startsWith("/invoices") ||
        pathname.startsWith("/invoice") ||
        pathname.startsWith("/facture"),
    },
    {
      name: "COMPTE",
      href: "/settings",
      icon: UserRound,
      matches: (pathname: string) =>
        pathname === "/settings" ||
        pathname.startsWith("/settings") ||
        pathname.startsWith("/billing") ||
        pathname.startsWith("/upgrade") ||
        pathname.startsWith("/success") ||
        pathname.startsWith("/cancel") ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/reset-password"),
    },
  ];

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const settingsWrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (settingsWrapRef.current?.contains(e.target as Node)) return;
      if (themeWrapRef.current?.contains(e.target as Node)) return;
      setIsSettingsOpen(false);
      setIsThemeMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  const findSettingsSectionEl = (hash: string): HTMLElement | null => {
    if (!hash) return null;
    const byId = document.getElementById(hash);
    if (byId) return byId;

    const byData = document.querySelector<HTMLElement>(
      `[data-section="${hash}"]`
    );
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

  const handleThemeSelect = (nextTheme: UITheme) => {
    setTheme(nextTheme);
    setIsThemeMenuOpen(false);
  };

  const handleExperienceSelect = (nextMode: UIExperienceMode) => {
    setMode(nextMode);
    setIsThemeMenuOpen(false);
  };

  const SettingsMenu = () => (
    <div className="absolute right-0 top-12 z-50 w-56 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl">
      <div className="bg-[var(--theme-bg)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
        Paramètres
      </div>

      <button
        type="button"
        onClick={() => goToSettingsSection("account")}
        className="w-full px-4 py-3 text-left text-sm font-bold text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
      >
        Compte
      </button>
      <button
        type="button"
        onClick={() => goToSettingsSection("subscription")}
        className="w-full px-4 py-3 text-left text-sm font-bold text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
      >
        Abonnement
      </button>

      <button
        type="button"
        onClick={() => goToSettingsSection("ai")}
        className="w-full px-4 py-3 text-left text-sm font-bold text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
      >
        IA
      </button>

      <button
        type="button"
        onClick={() => goToSettingsSection("billing")}
        className="w-full px-4 py-3 text-left text-sm font-bold text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
      >
        Facturation
      </button>
      <button
        type="button"
        onClick={() => goToSettingsSection("security")}
        className="w-full px-4 py-3 text-left text-sm font-bold text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
      >
        Sécurité
      </button>

      <div className="h-px bg-[var(--theme-border)]" />

      <button
        type="button"
        onClick={() => {
          setIsSettingsOpen(false);
          navigate("/settings");
        }}
        className="w-full px-4 py-3 text-left text-sm font-black text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
      >
        Ouvrir tous les réglages
      </button>
    </div>
  );

  const ThemeMenu = () => (
    <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl">
      <div className="bg-[var(--theme-bg)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
        Designs
      </div>

      {(["classic", "midnight", "sunset"] as UITheme[]).map((themeOption) => (
        <button
          key={themeOption}
          type="button"
          onClick={() => handleThemeSelect(themeOption)}
          className={`w-full px-4 py-3 text-left text-sm font-bold hover:bg-[var(--theme-bg)] ${
            theme === themeOption
              ? "bg-[var(--theme-bg)] text-[var(--theme-text)]"
              : "text-[var(--theme-text)]"
          }`}
        >
          {UI_THEME_LABELS[themeOption]}
        </button>
      ))}

      <div className="h-px bg-[var(--theme-border)]" />

      <div className="bg-[var(--theme-bg)] px-3 py-2 text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
        Expérience IA
      </div>

      {(["embedded-lite", "embedded-panel"] as UIExperienceMode[]).map(
        (modeOption) => (
          <button
            key={modeOption}
            type="button"
            onClick={() => handleExperienceSelect(modeOption)}
            className={`w-full px-4 py-3 text-left text-sm font-bold hover:bg-[var(--theme-bg)] ${
              mode === modeOption
                ? "bg-[var(--theme-bg)] text-[var(--theme-text)]"
                : "text-[var(--theme-text)]"
            }`}
          >
            {UI_EXPERIENCE_LABELS[modeOption]}
          </button>
        )
      )}
    </div>
  );

  return (
    <div
      className={`app-theme app-theme-${theme} relative flex h-screen flex-col overflow-hidden font-sans`}
    >
      <div className="z-50 shrink-0 bg-[var(--theme-primary)] py-1 text-[10px] font-black uppercase tracking-tighter text-[var(--theme-primary-contrast)]">
        <div className="flex items-center justify-center gap-2">
          <span>⚡ Mode Direct (IA Local)</span>
        </div>
      </div>

      <header className="z-40 shrink-0 border-b border-[var(--theme-border)] bg-[var(--theme-card)] px-6 py-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--theme-primary)] text-[var(--theme-primary-contrast)] shadow-lg">
              <span className="text-lg">🛠️</span>
            </div>

            <Link to="/dashboard" className="transition-opacity hover:opacity-90">
              <div>
                <h1 className="flex items-center gap-1 text-xl font-black leading-none text-[var(--theme-text)]">
                  Artisan<span className="text-[var(--theme-primary)]">Pro</span>
                </h1>

                <div className="mt-1 flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
                    Plan {String(plan).toUpperCase()}
                  </span>

                  {isPro ? (
                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">
                      Illimité
                    </span>
                  ) : displayedLimit > 0 ? (
                    <div className="w-28">
                      <div className="flex justify-between text-[9px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
                        <span>
                          {displayedUsed}/{displayedLimit}
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--theme-bg)]">
                        <div
                          className={`${getBarColor()} h-full rounded-full`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
                      —
                    </span>
                  )}
                </div>

                {!isPro && dailyUsage && (
                  <div className="mt-1 text-[9px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
                    IA aujourd’hui
                  </div>
                )}
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {!isPro && (
              <Link
                to="/upgrade"
                className={`rounded-xl px-3 py-2 text-xs font-bold uppercase tracking-widest text-white transition-colors ${getUpgradeCtaClass()}`}
              >
                Passer PRO
              </Link>
            )}

            <button className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)] hover:bg-[var(--theme-bg)]">
              ?
            </button>

            <div className="relative" ref={themeWrapRef}>
              <button
                onClick={() => {
                  setIsThemeMenuOpen((v) => !v);
                  setIsSettingsOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)] hover:bg-[var(--theme-bg)]"
                aria-haspopup="menu"
                aria-expanded={isThemeMenuOpen}
                aria-label="Changer le design"
              >
                <Palette size={16} />
              </button>

              {isThemeMenuOpen && <ThemeMenu />}
            </div>

            <div className="relative" ref={settingsWrapRef}>
              <button
                onClick={() => {
                  setIsSettingsOpen((v) => !v);
                  setIsThemeMenuOpen(false);
                }}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] text-[var(--theme-muted)] hover:bg-[var(--theme-bg)]"
                aria-haspopup="menu"
                aria-expanded={isSettingsOpen}
                aria-label="Réglages"
              >
                ⚙️
              </button>

              {isSettingsOpen && <SettingsMenu />}
            </div>
          </div>
        </div>
      </header>

      <main className="relative flex-1 overflow-y-auto bg-[var(--theme-bg)] pb-32 text-[var(--theme-text)]">
        <Outlet />
      </main>

      <div className="fixed bottom-24 right-6 z-[60] flex flex-col items-end gap-4">
        {isChatOpen && (
          <div className="animate-in slide-in-from-bottom-5 flex max-h-[650px] w-[380px] flex-col overflow-hidden rounded-[2.5rem] border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-2xl duration-300">
            <div className="flex items-center justify-between bg-[var(--theme-primary)] p-5 text-[var(--theme-primary-contrast)]">
              <span className="flex items-center gap-2 text-xs font-black uppercase tracking-widest">
                <Sparkles size={14} className="text-purple-400" />
                Mode Expert IA
              </span>
              <button
                onClick={() => setIsChatOpen(false)}
                className="rounded-xl p-1.5 transition-colors hover:bg-[rgba(255,255,255,0.10)]"
              >
                <X size={18} />
              </button>
            </div>

            <div className="custom-scrollbar flex-1 overflow-y-auto bg-[var(--theme-bg)]">
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
          onClick={() => {
            setIsChatOpen((prev) => {
              const next = !prev;
              if (next) setActiveTab("chat");
              return next;
            });
          }}
          className={`flex h-14 w-14 items-center justify-center rounded-full border-4 border-white shadow-2xl transition-all duration-300 ${
            isChatOpen
              ? "scale-90 rotate-90 bg-[var(--theme-text)] text-[var(--theme-card)]"
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

      <div className="fixed bottom-6 left-4 right-4 z-50">
        <div className="flex items-center justify-around rounded-full border border-[var(--theme-border)] bg-[var(--theme-card)] px-6 py-3 shadow-2xl">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = item.matches(location.pathname);

            return (
              <Link
                key={item.name}
                to={item.href}
                className={`flex flex-col items-center gap-1 transition-all duration-300 ${
                  isActive ? "scale-110" : "opacity-60 hover:opacity-100"
                }`}
              >
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-full shadow-lg ${
                    isActive
                      ? "bg-[var(--theme-primary)]"
                      : "bg-[var(--theme-bg)]"
                  }`}
                >
                  <Icon
                    size={18}
                    className={
                      isActive ? "text-white" : "text-[var(--theme-muted)]"
                    }
                  />
                </div>
                <span className="text-[9px] font-black uppercase tracking-widest text-[var(--theme-text)]">
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