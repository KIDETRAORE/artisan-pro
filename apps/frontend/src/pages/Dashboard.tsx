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
import { ComptaReportSchema } from "../schemas/comptaReport.schema";

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

type LatestComptaResponse = {
  id?: string;
  report?: unknown;
};

function formatEuroFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatEuro(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
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

function safeParseResult(value: unknown): unknown {
  if (!value) return value;

  if (typeof value === "string") {
    const cleaned = value.replace(/```json|```/gi, "").trim();
    try {
      return JSON.parse(cleaned);
    } catch {
      return cleaned;
    }
  }

  return value;
}

export default function Dashboard() {
  const report = useComptaReportStore((s) => s.report);
  const setReport = useComptaReportStore((s) => s.setReport);

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);

  const restoreFetchOnceRef = useRef(false);

  useEffect(() => {
    if (restoreFetchOnceRef.current) return;
    restoreFetchOnceRef.current = true;

    let cancelled = false;
    setKpisLoading(true);

    (async () => {
      try {
        const dash = await fetchWithAuth<DashboardResponse>("/dashboard", {
          method: "GET",
        });

        if (!cancelled) {
          setKpis(dash?.kpis ?? null);
        }
      } catch {
        if (!cancelled) setKpis(null);
      } finally {
        if (!cancelled) setKpisLoading(false);
      }

      try {
        const data = await fetchWithAuth<LatestComptaResponse>(
          "/ai/compta/latest",
          {
            method: "GET",
          }
        );

        const parsedRaw = safeParseResult(data?.report);
        const parsed = ComptaReportSchema.safeParse(parsedRaw);

        if (!parsed.success) return;

        if (!cancelled) {
          setReport(parsed.data);
        }
      } catch {
        // best effort
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [setReport]);

  const hasComptaReport = !!report;

  const kpiCaMois = kpis?.revenue?.paidMonthCents ?? 0;
  const kpiDevisPending = kpis?.quotes?.pendingCount ?? 0;
  const kpiImpayes = kpis?.invoices?.unpaidTotalCents ?? 0;
  const overdueCount = kpis?.invoices?.overdueCount ?? 0;
  const impayesCount = kpis?.invoices?.unpaidCount ?? 0;

  const preview = kpis?.invoices?.preview ?? [];

  const recettesHT = report?.totals?.recettesHT ?? 0;
  const depensesHT = report?.totals?.depensesHT ?? 0;
  const resultatNet = report?.totals?.resultatNet ?? 0;

  const card1Title = hasComptaReport ? "Recettes" : "Chiffre d'Affaires";
  const card1Value = hasComptaReport
    ? formatEuro(recettesHT)
    : formatEuroFromCents(kpiCaMois);
  const card1Trend = hasComptaReport
    ? "Analyse compta IA"
    : kpisLoading
    ? "Chargement"
    : "Payé ce mois";
  const card1To = "/dashboard/revenue";

  const card2Title = hasComptaReport ? "Dépenses" : "Devis en attente";
  const card2Value = hasComptaReport
    ? formatEuro(depensesHT)
    : `${kpiDevisPending}`;
  const card2Trend = hasComptaReport
    ? "Analyse compta IA"
    : kpisLoading
    ? "Chargement"
    : kpiDevisPending > 0
    ? `${kpiDevisPending} en attente`
    : "Aucun";
  const card2To = "/dashboard/quotes";

  const card3Title = hasComptaReport ? "Résultat net" : "Factures impayées";
  const card3Value = hasComptaReport
    ? formatEuro(resultatNet)
    : formatEuroFromCents(kpiImpayes);
  const card3Trend = hasComptaReport
    ? resultatNet >= 0
      ? "Analyse compta IA"
      : "Vigilance"
    : kpisLoading
    ? "Chargement"
    : impayesCount === 0
    ? "RAS"
    : overdueCount > 0
    ? `${overdueCount} en retard`
    : "Action requise";
  const card3To = "/dashboard/unpaid";

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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title={card1Title}
          value={card1Value}
          trend={card1Trend}
          icon={<TrendingUp className="text-emerald-500" />}
          to={card1To}
        />
        <StatCard
          title={card2Title}
          value={card2Value}
          trend={card2Trend}
          icon={<Clock className="text-amber-500" />}
          to={card2To}
        />
        <StatCard
          title={card3Title}
          value={card3Value}
          trend={card3Trend}
          icon={<AlertTriangle className="text-red-500" />}
          to={card3To}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
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
    </div>
  );
}

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