// apps/frontend/src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  Clock,
  AlertTriangle,
  Send,
  ArrowRight,
  FileText,
} from "lucide-react";
import { Link } from "react-router-dom";
import { useComptaReportStore } from "../store/comptaReport.store";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { ComptaReportSchema } from "../pages/Compta";

type InvoicePreview = {
  id: string;
  client: string;
  totalAmountCents: number;
  dueDate: string;
  status: string;
  daysLate: number;
};

type DashboardKpis = {
  revenue: {
    paidAllTimeCents: number;
    paidMonthCents: number;
  };
  invoices: {
    unpaidCount: number;
    unpaidTotalCents: number;
    overdueCount: number;
    overdueTotalCents: number;
    preview: InvoicePreview[];
  };
  quotes: {
    pendingCount: number;
  };
  meta?: {
    centsMode?: boolean;
  };
};

type DashboardResponse = {
  kpis?: DashboardKpis;
};

function formatEuroFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

export default function Dashboard() {
  const report = useComptaReportStore((s) => s.report);
  const setReport = useComptaReportStore((s) => s.setReport);

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);

  // ✅ évite double fetch en dev (React 18 StrictMode)
  const restoreFetchOnceRef = useRef(false);

  useEffect(() => {
    if (restoreFetchOnceRef.current) return;
    restoreFetchOnceRef.current = true;

    let cancelled = false;
    setKpisLoading(true);

    (async () => {
      try {
        // 1) KPIs Dashboard (factures)
        const dash = await fetchWithAuth<DashboardResponse>("/dashboard", {
          method: "GET",
        });
        if (!cancelled) setKpis(dash?.kpis ?? null);
      } catch {
        if (!cancelled) setKpis(null);
      } finally {
        if (!cancelled) setKpisLoading(false);
      }

      try {
        // 2) hydrate compta report (inchangé)
        const data = await fetchWithAuth<unknown>("/ai/compta/latest", {
          method: "GET",
        });

        const parsed = ComptaReportSchema.safeParse(data);
        if (!parsed.success) return;

        if (!cancelled) setReport(parsed.data);
      } catch {
        // best effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setReport]);

  // ✅ NOUVEAU: valeurs factures (source of truth)
  const caMois = kpis?.revenue?.paidMonthCents ?? 0;
  const devisPending = kpis?.quotes?.pendingCount ?? 0;
  const impayes = kpis?.invoices?.unpaidTotalCents ?? 0;
  const overdueCount = kpis?.invoices?.overdueCount ?? 0;
  const impayesCount = kpis?.invoices?.unpaidCount ?? 0;

  const preview = kpis?.invoices?.preview ?? [];

  const trendCA = useMemo(() => {
    if (kpisLoading) return "Chargement";
    return "Payé ce mois";
  }, [kpisLoading]);

  const trendDevis = useMemo(() => {
    if (kpisLoading) return "Chargement";
    return devisPending > 0 ? `${devisPending} en attente` : "Aucun";
  }, [kpisLoading, devisPending]);

  const trendImpayes = useMemo(() => {
    if (kpisLoading) return "Chargement";
    if (impayesCount === 0) return "RAS";
    if (overdueCount > 0) return `${overdueCount} en retard`;
    return "Action requise";
  }, [kpisLoading, impayesCount, overdueCount]);

  // (Compta report conservé pour d'autres usages / sections si tu veux)
  const recettesHT = report?.totals?.recettesHT ?? 0;
  const depensesHT = report?.totals?.depensesHT ?? 0;
  const resultatNet = report?.totals?.resultatNet ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div>
        <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight">
          Tableau de bord
        </h2>
        <p className="text-slate-500 mt-1">
          Bienvenue sur votre centre de pilotage ArtisanPro.
        </p>
      </div>

      {/* 2. STATS RAPIDES (FACTURES) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Chiffre d'Affaires"
          value={formatEuroFromCents(caMois)}
          trend={trendCA}
          icon={<TrendingUp className="text-emerald-500" />}
          to="/dashboard/revenue"
        />
        <StatCard
          title="Devis en attente"
          value={`${devisPending}`}
          trend={trendDevis}
          icon={<Clock className="text-amber-500" />}
          to="/dashboard/quotes"
        />
        <StatCard
          title="Factures impayées"
          value={formatEuroFromCents(impayes)}
          trend={trendImpayes}
          icon={<AlertTriangle className="text-red-500" />}
          to="/dashboard/unpaid"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* 3. SECTION FACTURES & RELANCES */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                Factures & Relances
              </h3>
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mt-1">
                Trésorerie active
              </p>
            </div>
            <Link
              to="/dashboard/unpaid"
              className="text-blue-600 text-sm font-bold flex items-center gap-1 hover:gap-2 transition-all"
            >
              Gérer les impayés <ArrowRight size={14} />
            </Link>
          </div>

          <div className="p-4 space-y-3 flex-1">
            {preview.length === 0 ? (
              <div className="p-4 text-sm text-slate-500">
                Aucune facture impayée détectée (ou données en cours de chargement).
              </div>
            ) : (
              preview.map((it) => (
                <InvoiceReminderItem
                  key={it.id}
                  client={it.client}
                  amount={formatEuroFromCents(it.totalAmountCents)}
                  daysLate={it.daysLate}
                  dueDate={it.dueDate}
                />
              ))
            )}
          </div>
        </div>

        {/* 4. SECTION DEVIS RÉCENTS (placeholder actuel) */}
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex justify-between items-center">
            <h3 className="text-lg font-bold text-slate-900">Derniers Devis</h3>
            <Link
              to="/devis"
              className="text-slate-400 hover:text-blue-600 transition-colors"
            >
              <ArrowRight size={20} />
            </Link>
          </div>

          <div className="divide-y divide-slate-50">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-400">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">
                      Projet Rénovation #{i}42
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      Client #00{i}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-slate-700">950 €</span>
              </div>
            ))}
          </div>
          <div className="p-4 bg-slate-50/50 text-center">
            <Link
              to="/devis"
              className="text-xs font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest"
            >
              Voir tout l&apos;historique
            </Link>
          </div>
        </div>
      </div>

      {/* (Optionnel) tu peux garder ces valeurs compta si tu veux les afficher ailleurs */}
      <div className="hidden">
        {recettesHT} {depensesHT} {resultatNet}
      </div>
    </div>
  );
}

// --- SOUS-COMPOSANTS INTERNES ---
function StatCard({ title, value, trend, icon, to }: any) {
  return (
    <Link
      to={to}
      className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm hover:shadow-md transition-all group block"
    >
      <div className="flex justify-between items-start mb-4">
        <div className="p-3 bg-slate-50 rounded-2xl group-hover:bg-blue-50 group-hover:text-blue-600 transition-colors">
          {icon}
        </div>
        <span className="text-[10px] font-bold px-2 py-1 bg-slate-100 rounded-lg text-slate-500">
          {trend}
        </span>
      </div>
      <p className="text-slate-500 text-sm font-medium">{title}</p>
      <h4 className="text-2xl font-black text-slate-900 mt-1">{value}</h4>
      <div className="mt-4 text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
        Voir le détail <ArrowRight size={14} />
      </div>
    </Link>
  );
}

function InvoiceReminderItem({ client, amount, daysLate, dueDate }: any) {
  const status = daysLate >= 10 ? "CRITIQUE" : daysLate > 0 ? "RETARD" : "À VENIR";

  return (
    <div className="flex items-center justify-between p-4 rounded-2xl border border-slate-50 hover:border-blue-100 hover:bg-blue-50/30 transition-all group">
      <div className="flex items-center gap-4">
        <div
          className={`w-1.5 h-8 rounded-full ${
            status === "CRITIQUE"
              ? "bg-red-500"
              : status === "RETARD"
              ? "bg-amber-500"
              : "bg-blue-500"
          }`}
        />
        <div>
          <p className="text-sm font-bold text-slate-900">{client}</p>
          <p className="text-[11px] text-slate-500 font-medium">
            {status === "À VENIR"
              ? `Échéance : ${formatDateFr(dueDate)}`
              : `${daysLate} jours de retard`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-black text-slate-900">{amount}</span>
        <button className="flex items-center gap-2 bg-slate-900 text-white px-3 py-2 rounded-xl text-xs font-bold hover:bg-blue-600 transition-all opacity-0 group-hover:opacity-100 shadow-lg shadow-slate-200">
          <Send size={12} /> Relancer
        </button>
      </div>
    </div>
  );
}