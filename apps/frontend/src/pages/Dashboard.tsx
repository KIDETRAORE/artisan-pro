// apps/frontend/src/pages/Dashboard.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  TrendingUp,
  Clock,
  AlertTriangle,
  Send,
  ArrowRight,
  FileText,
  Sparkles,
} from "lucide-react";
import { Link } from "react-router-dom";
import AIInsightCard from "../components/ai/AIInsightCard";
import { useComptaReportStore } from "../store/comptaReport.store";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { ComptaReportSchema } from "../schemas/comptaReport.schema";
import { useUIExperienceStore } from "../store/uiExperience.store";
import { listRecentQuotes, type Quote } from "../api/quotes.api";

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
  insights?: {
    revenue?: string;
    quotes?: string;
    unpaid?: string;
  };
  kpis?: DashboardKpis;
};

type LatestComptaResponse = {
  id?: string;
  report?: unknown;
};

type DashboardAiInsight = {
  title: string;
  summary: string;
  bullets: string[];
  action: string;
  tone: "healthy" | "warning" | "critical";
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

function buildDashboardInsight(params: {
  hasComptaReport: boolean;
  recettesHT: number;
  depensesHT: number;
  resultatNet: number;
  overdueCount: number;
  impayesCount: number;
  kpiDevisPending: number;
  kpiImpayes: number;
}): DashboardAiInsight {
  const {
    hasComptaReport,
    recettesHT,
    depensesHT,
    resultatNet,
    overdueCount,
    impayesCount,
    kpiDevisPending,
    kpiImpayes,
  } = params;

  if (hasComptaReport) {
    if (resultatNet < 0) {
      return {
        title: "Alerte rentabilité",
        summary:
          "Le résultat net ressort en négatif. L'activité doit être surveillée immédiatement.",
        bullets: [
          `Recettes estimées : ${formatEuro(recettesHT)}`,
          `Dépenses estimées : ${formatEuro(depensesHT)}`,
          "Les charges dépassent actuellement la capacité de couverture.",
        ],
        action:
          "Identifier les postes de dépenses à réduire et sécuriser les encaissements prioritaires.",
        tone: "critical",
      };
    }

    if (depensesHT > 0 && recettesHT > 0 && resultatNet / recettesHT < 0.15) {
      return {
        title: "Marge fragile",
        summary:
          "La rentabilité reste positive mais la marge de sécurité semble faible.",
        bullets: [
          `Résultat net estimé : ${formatEuro(resultatNet)}`,
          "La moindre dérive de coût peut dégrader le mois en cours.",
          "Un suivi plus fin des dépenses est recommandé.",
        ],
        action:
          "Surveiller les dépenses de chantier et renforcer la marge sur les prochains devis.",
        tone: "warning",
      };
    }

    return {
      title: "Activité saine",
      summary:
        "Les indicateurs comptables sont cohérents et ne montrent pas de tension immédiate.",
      bullets: [
        `Résultat net estimé : ${formatEuro(resultatNet)}`,
        "Les équilibres recettes / dépenses restent corrects.",
        "Tu peux te concentrer sur l'optimisation et la relance proactive.",
      ],
      action:
        "Capitaliser sur les chantiers les plus rentables et standardiser les bonnes pratiques.",
      tone: "healthy",
    };
  }

  if (overdueCount > 0 || impayesCount > 0) {
    return {
      title: "Priorité trésorerie",
      summary:
        "Des factures impayées ou en retard pèsent sur la visibilité de trésorerie.",
      bullets: [
        `${impayesCount} facture(s) impayée(s) détectée(s)`,
        `${overdueCount} facture(s) en retard`,
        `Montant à sécuriser : ${formatEuroFromCents(kpiImpayes)}`,
      ],
      action:
        "Relancer en priorité les dossiers en retard pour sécuriser les encaissements.",
      tone: overdueCount > 0 ? "critical" : "warning",
    };
  }

  if (kpiDevisPending > 0) {
    return {
      title: "Pipeline commercial actif",
      summary:
        "Des devis sont en attente de validation. Ils représentent le prochain levier d'activité.",
      bullets: [
        `${kpiDevisPending} devis en attente`,
        "Le suivi rapide peut accélérer la conversion.",
        "Une relance structurée améliore le taux d'acceptation.",
      ],
      action:
        "Prioriser les relances des devis les plus récents ou les plus stratégiques.",
      tone: "warning",
    };
  }

  return {
    title: "Vue d'ensemble stable",
    summary:
      "Aucune alerte majeure n'est détectée pour le moment sur l'activité courante.",
    bullets: [
      "Pas d'impayé critique détecté",
      "Pas de tension immédiate visible sur les indicateurs principaux",
      "Le focus peut être mis sur les prochaines opportunités",
    ],
    action:
      "Conserver un rythme de suivi régulier et anticiper les prochaines actions commerciales.",
    tone: "healthy",
  };
}

function getInsightToneClasses(tone: DashboardAiInsight["tone"]): string {
  if (tone === "critical") {
    return "border-red-200 bg-red-50 text-red-700";
  }
  if (tone === "warning") {
    return "border-amber-200 bg-amber-50 text-amber-700";
  }
  return "border-emerald-200 bg-emerald-50 text-emerald-700";
}

function formatQuoteAmount(quote: Quote): string {
  if (typeof quote.total_amount_cents === "number") {
    return formatEuroFromCents(quote.total_amount_cents);
  }
  if (typeof quote.total_amount === "number") {
    return formatEuro(quote.total_amount);
  }
  return "—";
}

function getQuoteDisplayTitle(quote: Quote): string {
  if (quote.title) return quote.title;
  if (quote.reference) return quote.reference;
  return `Devis #${quote.id.slice(0, 8)}`;
}

export default function Dashboard() {
  const report = useComptaReportStore((s) => s.report);
  const setReport = useComptaReportStore((s) => s.setReport);
  const { mode } = useUIExperienceStore();

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [insights, setInsights] = useState<DashboardResponse["insights"] | null>(
    null
  );
  const [recentQuotes, setRecentQuotes] = useState<Quote[]>([]);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [isInsightOpen, setIsInsightOpen] = useState(false);

  const restoreFetchOnceRef = useRef(false);

  useEffect(() => {
    if (restoreFetchOnceRef.current) return;
    restoreFetchOnceRef.current = true;

    let cancelled = false;
    setKpisLoading(true);

    (async () => {
      try {
        const [dash, quotes] = await Promise.all([
          fetchWithAuth<DashboardResponse>("/dashboard", {
            method: "GET",
          }),
          listRecentQuotes(3),
        ]);

        if (!cancelled) {
          setKpis(dash?.kpis ?? null);
          setInsights(dash?.insights ?? null);
          setRecentQuotes(quotes);
        }
      } catch {
        if (!cancelled) {
          setKpis(null);
          setInsights(null);
          setRecentQuotes([]);
        }
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

  const dashboardInsight = useMemo(
    () =>
      buildDashboardInsight({
        hasComptaReport,
        recettesHT,
        depensesHT,
        resultatNet,
        overdueCount,
        impayesCount,
        kpiDevisPending,
        kpiImpayes,
      }),
    [
      hasComptaReport,
      recettesHT,
      depensesHT,
      resultatNet,
      overdueCount,
      impayesCount,
      kpiDevisPending,
      kpiImpayes,
    ]
  );

  const card1Title = "Chiffre d'Affaires";
  const card1Value = formatEuroFromCents(kpiCaMois);
  const card1Trend = kpisLoading ? "Chargement" : "Payé ce mois";
  const card1To = "/dashboard/revenue";

  const card2Title = "Devis en attente";
  const card2Value = `${kpiDevisPending}`;
  const card2Trend = kpisLoading
    ? "Chargement"
    : kpiDevisPending > 0
      ? `${kpiDevisPending} en attente`
      : "Aucun";
  const card2To = "/dashboard/quotes";

  const card3Title = "Factures impayées";
  const card3Value = formatEuroFromCents(kpiImpayes);
  const card3Trend = kpisLoading
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
          Accueil
        </h2>
        <p className="mt-1 text-[var(--theme-muted)]">
          Bienvenue sur votre centre de pilotage intelligent ArtisanPro.
        </p>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-sm">
        <div className="flex items-start justify-between gap-4 p-6">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--theme-bg)] text-[var(--theme-primary)]">
              <Sparkles size={20} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold text-[var(--theme-text)]">
                  Conseil IA
                </h3>
                <span
                  className={`rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-widest ${getInsightToneClasses(
                    dashboardInsight.tone
                  )}`}
                >
                  {mode === "embedded-lite" ? "Mode A" : "Mode B"}
                </span>
              </div>

              <p className="text-sm font-semibold text-[var(--theme-text)]">
                {dashboardInsight.title}
              </p>
              <p className="text-sm text-[var(--theme-muted)]">
                {dashboardInsight.summary}
              </p>

              {mode === "embedded-lite" ? (
                <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-primary)]">
                  {dashboardInsight.action}
                </p>
              ) : (
                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <p className="text-xs font-bold uppercase tracking-widest text-[var(--theme-primary)]">
                    {dashboardInsight.action}
                  </p>
                  <button
                    type="button"
                    onClick={() => setIsInsightOpen((prev) => !prev)}
                    className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-xs font-bold uppercase tracking-widest text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
                  >
                    {isInsightOpen ? "Masquer l'analyse" : "Voir l'analyse"}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        {mode === "embedded-panel" && isInsightOpen ? (
          <div className="border-t border-[var(--theme-border)] bg-[var(--theme-bg)]/50 px-6 py-5">
            <div className="space-y-3">
              <div className="text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                Analyse détaillée
              </div>

              <ul className="space-y-2">
                {dashboardInsight.bullets.map((item) => (
                  <li
                    key={item}
                    className="flex gap-3 text-sm text-[var(--theme-text)]"
                  >
                    <span className="mt-[7px] h-1.5 w-1.5 rounded-full bg-[var(--theme-primary)]" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>

              <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4">
                <div className="text-[11px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
                  Action recommandée
                </div>
                <div className="mt-2 text-sm font-medium text-[var(--theme-text)]">
                  {dashboardInsight.action}
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="space-y-3">
          <StatCard
            title={card1Title}
            value={card1Value}
            trend={card1Trend}
            icon={<TrendingUp className="text-emerald-500" />}
            to={card1To}
          />
          <AIInsightCard title={card1Title} insight={insights?.revenue ?? null} />
        </div>

        <div className="space-y-3">
          <StatCard
            title={card2Title}
            value={card2Value}
            trend={card2Trend}
            icon={<Clock className="text-amber-500" />}
            to={card2To}
          />
          <AIInsightCard title={card2Title} insight={insights?.quotes ?? null} />
        </div>

        <div className="space-y-3">
          <StatCard
            title={card3Title}
            value={card3Value}
            trend={card3Trend}
            icon={<AlertTriangle className="text-red-500" />}
            to={card3To}
          />
          <AIInsightCard title={card3Title} insight={insights?.unpaid ?? null} />
        </div>
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
                Aucune facture impayée détectée (ou données en cours de
                chargement).
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
            {recentQuotes.length === 0 ? (
              <div className="p-4 text-sm text-[var(--theme-muted)]">
                Aucun devis récent disponible.
              </div>
            ) : (
              recentQuotes.map((quote) => (
                <div
                  key={quote.id}
                  className="flex items-center justify-between p-4 transition-colors hover:bg-[var(--theme-bg)]"
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--theme-bg)] text-[var(--theme-muted)]">
                      <FileText size={18} />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-[var(--theme-text)]">
                        {getQuoteDisplayTitle(quote)}
                      </p>
                      <p className="text-xs font-medium text-[var(--theme-muted)]">
                        {quote.client_name}
                      </p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-[var(--theme-text)]">
                    {formatQuoteAmount(quote)}
                  </span>
                </div>
              ))
            )}
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

function StatCard({
  title,
  value,
  trend,
  icon,
  to,
}: {
  title: string;
  value: string;
  trend: string;
  icon: React.ReactNode;
  to: string;
}) {
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
      <h4 className="mt-1 text-2xl font-black text-[var(--theme-text)]">
        {value}
      </h4>
      <div className="mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[var(--theme-muted)]">
        Voir le détail <ArrowRight size={14} />
      </div>
    </Link>
  );
}

function InvoiceReminderItem({
  client,
  amount,
  daysLate,
  dueDate,
}: {
  client: string;
  amount: string;
  daysLate: number;
  dueDate: string;
}) {
  const status =
    daysLate >= 10 ? "CRITIQUE" : daysLate > 0 ? "RETARD" : "À VENIR";

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
        <span className="text-sm font-black text-[var(--theme-text)]">
          {amount}
        </span>
        <button className="flex items-center gap-2 rounded-xl bg-[var(--theme-primary)] px-3 py-2 text-xs font-bold text-white opacity-0 shadow-lg shadow-slate-200 transition-all group-hover:opacity-100 hover:bg-blue-600">
          <Send size={12} /> Relancer
        </button>
      </div>
    </div>
  );
}