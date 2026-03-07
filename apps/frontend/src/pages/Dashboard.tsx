// apps/frontend/src/pages/Dashboard.tsx
import React, { useEffect, useRef, useState } from "react";
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
  const card2Value = hasComptaReport ? formatEuro(depensesHT) : `${kpiDevisPending}`;
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
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-700">
      <div>
        <h2 className="text-3xl font-extrabold tracking-tight text-[var(--theme-text)]">
          Tableau de bord
        </h2>
        <p className="mt-1 text-[var(--theme-muted)]">
          Bienvenue sur votre centre de pilotage ArtisanPro.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
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

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="flex flex-col overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--theme-border)] bg-[var(--theme-card)] p-6">
            <div>
              <h3 className="text-lg font-bold text-[var(--theme-text)]">
                Factures & Relances
              </h3>
              <p className="mt-1 text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
                Trésorerie active
              </p>
            </div>
            <Link
              to="/dashboard/unpaid"
              className="flex items-center gap-1 text-sm font-bold text-[var(--theme-primary)] transition-all hover:gap-2"
            >
              Gérer les impayés <ArrowRight size={14} />
            </Link>
          </div>

          <div className="flex-1 space-y-3 p-4">
            {preview.length === 0 ? (
              <div className="p-4 text-sm text-[var(--theme-muted)]">
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

        <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl">
          <div className="flex items-center justify-between border-b border-[var(--theme-border)] p-6">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">
              Derniers Devis
            </h3>
            <Link
              to="/devis"
              className="text-[var(--theme-muted)] transition-colors hover:text-[var(--theme-primary)]"
            >
              <ArrowRight size={20} />
            </Link>
          </div>

          <div className="divide-y divide-[var(--theme-border)]">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center justify-between p-4 transition-colors hover:bg-[var(--theme-bg)]"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--theme-bg)] text-[var(--theme-muted)]">
                    <FileText size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[var(--theme-text)]">
                      Projet Rénovation #{i}42
                    </p>
                    <p className="text-xs font-medium text-[var(--theme-muted)]">
                      Client #00{i}
                    </p>
                  </div>
                </div>
                <span className="text-sm font-bold text-[var(--theme-text)]">
                  950 €
                </span>
              </div>
            ))}
          </div>
          <div className="bg-[var(--theme-bg)]/50 p-4 text-center">
            <Link
              to="/devis"
              className="text-xs font-bold uppercase tracking-widest text-[var(--theme-muted)] hover:text-[var(--theme-primary)]"
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
      className="group block rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-sm transition-all hover:shadow-md"
    >
      <div className="mb-4 flex items-start justify-between">
        <div className="rounded-2xl bg-[var(--theme-bg)] p-3 transition-colors group-hover:bg-blue-50 group-hover:text-blue-600">
          {icon}
        </div>
        <span className="rounded-lg bg-[var(--theme-bg)] px-2 py-1 text-[10px] font-bold text-[var(--theme-muted)]">
          {trend}
        </span>
      </div>
      <p className="text-sm font-medium text-[var(--theme-muted)]">{title}</p>
      <h4 className="mt-1 text-2xl font-black text-[var(--theme-text)]">{value}</h4>
      <div className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--theme-muted)]">
        Voir le détail <ArrowRight size={14} />
      </div>
    </Link>
  );
}

function InvoiceReminderItem({ client, amount, daysLate, dueDate }: any) {
  const status = daysLate >= 10 ? "CRITIQUE" : daysLate > 0 ? "RETARD" : "À VENIR";

  return (
    <div className="group flex items-center justify-between rounded-2xl border border-[var(--theme-border)] p-4 transition-all hover:border-blue-100 hover:bg-blue-50/30">
      <div className="flex items-center gap-4">
        <div
          className={`h-8 w-1.5 rounded-full ${
            status === "CRITIQUE"
              ? "bg-red-500"
              : status === "RETARD"
              ? "bg-amber-500"
              : "bg-blue-500"
          }`}
        />
        <div>
          <p className="text-sm font-bold text-[var(--theme-text)]">{client}</p>
          <p className="text-[11px] font-medium text-[var(--theme-muted)]">
            {status === "À VENIR"
              ? `Échéance : ${formatDateFr(dueDate)}`
              : `${daysLate} jours de retard`}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <span className="text-sm font-black text-[var(--theme-text)]">{amount}</span>
        <button className="flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-3 py-2 text-xs font-bold text-white opacity-0 shadow-lg shadow-slate-200 transition-all group-hover:opacity-100 hover:bg-blue-600">
          <Send size={12} /> Relancer
        </button>
      </div>
    </div>
  );
}