// apps/frontend/src/pages/ProjectDetail.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Receipt,
  Wallet,
  TrendingUp,
  TrendingDown,
  Sparkles,
} from "lucide-react";
import { fetchWithAuth } from "../auth/fetchWithAuth";

type Project = {
  id: string;
  name: string;
  client_name?: string | null;
  address?: string | null;
  description?: string | null;
  status?: string;
  budget_cents?: number | null;
  created_at?: string;
};

type ProjectAlert = {
  code:
    | "no_revenue"
    | "budget_exceeded"
    | "budget_high_consumption"
    | "negative_margin"
    | "low_margin";
  level: "info" | "warning" | "critical";
  message: string;
};

type ProjectAnalytics = {
  revenue_cents: number;
  paid_cents: number;
  expenses_cents: number;
  profit_cents: number;
  profitability_rate: number;
  budget_cents: number;
  remaining_budget_cents: number;
  budget_consumed_rate: number;
  health_status: "healthy" | "warning" | "critical";
  alerts: ProjectAlert[];
};

type ProjectInsight = {
  title: string;
  summary: {
    revenue_eur: number;
    expenses_eur: number;
    profit_eur: number;
    profitability_rate: number;
  };
  issues: string[];
  actions: string[];
  recommendation: string;
};

type ProjectExpense = {
  id: string;
  label?: string | null;
  description?: string | null;
  category?: string | null;
  amount_cents?: number | null;
  spent_at?: string | null;
  created_at?: string;
};

type GetProjectResponse = {
  success: boolean;
  project: Project;
};

type GetProjectAnalyticsResponse = {
  success: boolean;
  analytics: ProjectAnalytics;
};

type GetProjectInsightsResponse = {
  success: boolean;
  insight: ProjectInsight;
};

type GetProjectExpensesResponse = {
  success: boolean;
  expenses: ProjectExpense[];
};

function formatEurFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatPercent(value: number): string {
  const safe = Number.isFinite(value) ? value : 0;
  return `${safe.toFixed(1)}%`;
}

function getHealthBadgeClasses(status: ProjectAnalytics["health_status"]) {
  if (status === "healthy") {
    return "bg-emerald-50 text-emerald-700 border border-emerald-200";
  }
  if (status === "warning") {
    return "bg-amber-50 text-amber-700 border border-amber-200";
  }
  return "bg-red-50 text-red-700 border border-red-200";
}

function getHealthLabel(status: ProjectAnalytics["health_status"]) {
  if (status === "healthy") return "Sain";
  if (status === "warning") return "Sous surveillance";
  return "Critique";
}

function getAlertClasses(level: ProjectAlert["level"]) {
  if (level === "info") return "border-slate-200 bg-slate-50 text-slate-700";
  if (level === "warning") return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-red-200 bg-red-50 text-red-700";
}

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const projectId = String(id || "");

  const [loading, setLoading] = useState(false);
  const [project, setProject] = useState<Project | null>(null);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [insight, setInsight] = useState<ProjectInsight | null>(null);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchOnceRef = useRef(false);

  const load = async () => {
    if (!projectId) return;

    setLoading(true);
    setError(null);

    try {
      const [projectRes, analyticsRes, insightRes, expensesRes] =
        await Promise.all([
          fetchWithAuth<GetProjectResponse>(`/projects/${projectId}`, {
            method: "GET",
          }),
          fetchWithAuth<GetProjectAnalyticsResponse>(
            `/projects/${projectId}/analytics`,
            {
              method: "GET",
            }
          ),
          fetchWithAuth<GetProjectInsightsResponse>(
            `/projects/${projectId}/insights`,
            {
              method: "GET",
            }
          ),
          fetchWithAuth<GetProjectExpensesResponse>(
            `/projects/${projectId}/expenses`,
            {
              method: "GET",
            }
          ).catch(() => ({ success: true, expenses: [] })),
        ]);

      setProject(projectRes.project ?? null);
      setAnalytics(analyticsRes.analytics ?? null);
      setInsight(insightRes.insight ?? null);
      setExpenses(expensesRes.expenses ?? []);
    } catch {
      setError("Impossible de charger le détail du chantier.");
      setProject(null);
      setAnalytics(null);
      setInsight(null);
      setExpenses([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (fetchOnceRef.current) return;
    fetchOnceRef.current = true;
    void load();
  }, [projectId]);

  const topExpenses = useMemo(() => {
    return [...expenses]
      .sort((a, b) => {
        const aAmount = Number(a.amount_cents ?? 0);
        const bAmount = Number(b.amount_cents ?? 0);
        return bAmount - aAmount;
      })
      .slice(0, 5);
  }, [expenses]);

  const budgetUsedDisplay = analytics
    ? formatPercent(analytics.budget_consumed_rate)
    : "—";

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/projects"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Retour
          </Link>

          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            {project?.name ?? "Chantier"}
          </h2>

          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-500">
            {project?.client_name ? <span>Client : {project.client_name}</span> : null}
            {project?.status ? <span>Statut : {project.status}</span> : null}
            {project?.address ? <span>{project.address}</span> : null}
          </div>
        </div>

        {analytics ? (
          <div
            className={`px-3 py-2 rounded-2xl text-sm font-black uppercase tracking-widest ${getHealthBadgeClasses(
              analytics.health_status
            )}`}
          >
            {getHealthLabel(analytics.health_status)}
          </div>
        ) : null}
      </div>

      {error ? (
        <div className="bg-white border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5" />
          <div>{error}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <MetricCard
          title="CA chantier"
          value={analytics ? formatEurFromCents(analytics.revenue_cents) : "—"}
          icon={<CircleDollarSign size={18} />}
          subtitle="Factures rattachées"
        />
        <MetricCard
          title="Dépenses"
          value={analytics ? formatEurFromCents(analytics.expenses_cents) : "—"}
          icon={<Receipt size={18} />}
          subtitle="Charges chantier"
        />
        <MetricCard
          title="Marge"
          value={analytics ? formatEurFromCents(analytics.profit_cents) : "—"}
          icon={
            analytics && analytics.profit_cents >= 0 ? (
              <TrendingUp size={18} />
            ) : (
              <TrendingDown size={18} />
            )
          }
          subtitle={
            analytics ? `${formatPercent(analytics.profitability_rate)}` : "—"
          }
        />
        <MetricCard
          title="Budget restant"
          value={
            analytics ? formatEurFromCents(analytics.remaining_budget_cents) : "—"
          }
          icon={<Wallet size={18} />}
          subtitle={`Consommé : ${budgetUsedDisplay}`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card
            title="Rentabilité chantier"
            description="Vue synthétique budget, dépenses et marge."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <InfoRow
                label="Budget chantier"
                value={
                  analytics ? formatEurFromCents(analytics.budget_cents) : "—"
                }
              />
              <InfoRow
                label="Budget consommé"
                value={analytics ? budgetUsedDisplay : "—"}
              />
              <InfoRow
                label="Montant payé"
                value={analytics ? formatEurFromCents(analytics.paid_cents) : "—"}
              />
              <InfoRow
                label="Marge %"
                value={analytics ? formatPercent(analytics.profitability_rate) : "—"}
              />
            </div>
          </Card>

          <Card
            title="Alertes chantier"
            description="Détection métier simple avant l’analyse IA."
          >
            {analytics?.alerts?.length ? (
              <div className="space-y-3">
                {analytics.alerts.map((alert) => (
                  <div
                    key={`${alert.code}-${alert.message}`}
                    className={`rounded-2xl border px-4 py-3 text-sm font-medium ${getAlertClasses(
                      alert.level
                    )}`}
                  >
                    {alert.message}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                Aucune alerte détectée pour le moment.
              </div>
            )}
          </Card>

          <Card
            title="Analyse IA chantier"
            description="Synthèse textuelle basée sur les chiffres du chantier."
          >
            {insight ? (
              <div className="space-y-5">
                <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-4 py-4">
                  <div className="flex items-center gap-2 text-indigo-700 font-bold">
                    <Sparkles size={16} />
                    {insight.title}
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    {insight.recommendation}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-900 mb-2">
                    Points d’attention
                  </div>
                  {insight.issues.length > 0 ? (
                    <div className="space-y-2">
                      {insight.issues.map((item) => (
                        <Bullet key={item}>{item}</Bullet>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm text-slate-500">
                      Aucun point bloquant signalé.
                    </div>
                  )}
                </div>

                <div>
                  <div className="text-sm font-bold text-slate-900 mb-2">
                    Actions recommandées
                  </div>
                  <div className="space-y-2">
                    {insight.actions.map((item) => (
                      <Bullet key={item}>{item}</Bullet>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                Analyse IA indisponible pour ce chantier.
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card
            title="Top dépenses"
            description="Les plus gros postes de coût du chantier."
          >
            {topExpenses.length > 0 ? (
              <div className="space-y-3">
                {topExpenses.map((expense) => (
                  <div
                    key={expense.id}
                    className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3"
                  >
                    <div className="text-sm font-bold text-slate-900">
                      {expense.label ||
                        expense.description ||
                        expense.category ||
                        "Dépense"}
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      {expense.category || "Sans catégorie"}
                    </div>
                    <div className="mt-2 text-sm font-black text-slate-900">
                      {formatEurFromCents(Number(expense.amount_cents ?? 0))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-slate-500">
                Aucune dépense rattachée à ce chantier.
              </div>
            )}
          </Card>

          <Card title="Informations chantier" description="Résumé rapide.">
            <div className="space-y-3">
              <InfoRow label="Nom" value={project?.name ?? "—"} />
              <InfoRow label="Client" value={project?.client_name ?? "—"} />
              <InfoRow label="Adresse" value={project?.address ?? "—"} />
              <InfoRow
                label="Budget prévu"
                value={
                  project
                    ? formatEurFromCents(Number(project.budget_cents ?? 0))
                    : "—"
                }
              />
              <InfoRow label="Statut" value={project?.status ?? "—"} />
            </div>
          </Card>
        </div>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Chargement…</div>
      ) : null}
    </div>
  );
}

function MetricCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
      <div className="p-5 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-black uppercase tracking-widest text-slate-400">
            {title}
          </div>
          <div className="mt-3 text-2xl font-extrabold text-slate-900">
            {value}
          </div>
          <div className="mt-2 text-xs text-slate-500 font-medium">
            {subtitle}
          </div>
        </div>
        <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-700">
          {icon}
        </div>
      </div>
    </div>
  );
}

function Card({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
      <div className="p-6 border-b border-slate-50">
        <h3 className="text-lg font-bold text-slate-900">{title}</h3>
        {description ? (
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            {description}
          </p>
        ) : null}
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

function InfoRow({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="text-sm text-slate-500">{label}</div>
      <div className="text-sm font-bold text-slate-900 text-right">{value}</div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <CheckCircle2 size={16} className="mt-0.5 text-emerald-600 shrink-0" />
      <div className="text-sm text-slate-700">{children}</div>
    </div>
  );
}