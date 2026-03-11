// apps/frontend/src/pages/ProjectDashboard.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Receipt, Wallet, Building2 } from "lucide-react";
import {
  getProject,
  getProjectAnalytics,
  getProjectInsights,
  importProjectAccountingFile,
  listProjectExpenses,
  type Project,
  type ProjectAnalytics,
  type ProjectExpense,
  type ProjectInsight,
} from "../api/projects.api";
import ProjectExpensesPanel from "../components/projects/ProjectExpensesPanel";
import { useAIInsight } from "../hooks/useAIInsight";

function formatEurosFromCents(cents: number): string {
  const eur = (Math.round(cents) / 100).toFixed(2);
  return `${eur.replace(".", ",")} €`;
}

function healthBadgeClass(status: ProjectAnalytics["health_status"]): string {
  if (status === "critical") {
    return "border border-red-200 bg-red-100 text-red-700";
  }
  if (status === "warning") {
    return "border border-amber-200 bg-amber-100 text-amber-700";
  }
  return "border border-emerald-200 bg-emerald-100 text-emerald-700";
}

function riskBadgeClass(risk: ProjectInsight["risk_level"]): string {
  if (risk === "high") {
    return "border border-red-200 bg-red-100 text-red-700";
  }
  if (risk === "medium") {
    return "border border-amber-200 bg-amber-100 text-amber-700";
  }
  return "border border-emerald-200 bg-emerald-100 text-emerald-700";
}

function categoryLabel(
  category: "materials" | "labor" | "equipment" | "transport" | "other"
): string {
  if (category === "materials") return "Matériaux";
  if (category === "labor") return "Main d’œuvre";
  if (category === "equipment") return "Équipement";
  if (category === "transport") return "Transport";
  return "Autres";
}

const PROJECT_CANONICAL_LINKS = [
  {
    title: "Ventes chantier",
    description: "Accéder aux factures clients liées au pilotage du chantier.",
    to: "/sales-invoices",
    icon: Receipt,
  },
  {
    title: "Achats chantier",
    description: "Accéder aux factures fournisseurs et suivre les coûts.",
    to: "/purchase-bills",
    icon: Building2,
  },
  {
    title: "Paiements chantier",
    description: "Suivre les encaissements et décaissements associés.",
    to: "/payments",
    icon: Wallet,
  },
];

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [insight, setInsight] = useState<ProjectInsight | null>(null);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { cleanedInsight: cleanedRecommendation } = useAIInsight({
    insight: insight?.recommendation ?? null,
  });

  const profitabilityLabel = useMemo(() => {
    const r = analytics?.profitability_rate ?? 0;
    return `${r.toFixed(2).replace(".", ",")} %`;
  }, [analytics]);

  const categoryBreakdown = useMemo(() => {
    if (!analytics) return [];

    const total = analytics.expenses_cents;
    const entries = Object.entries(analytics.expenses_by_category) as Array<
      ["materials" | "labor" | "equipment" | "transport" | "other", number]
    >;

    return entries
      .filter(([, amount]) => amount > 0)
      .map(([category, amount]) => ({
        category,
        label: categoryLabel(category),
        amount,
        share: total > 0 ? (amount / total) * 100 : 0,
      }))
      .sort((a, b) => b.amount - a.amount);
  }, [analytics]);

  const previewExpenses = useMemo(() => expenses.slice(0, 3), [expenses]);

  const amountToCollectCents = useMemo(() => {
    if (!analytics) return 0;
    return Math.max(0, analytics.revenue_cents - analytics.paid_cents);
  }, [analytics]);

  const keyActions = useMemo(() => {
    if (!analytics) return [];

    const actions: string[] = [];

    if (analytics.health_status === "critical") {
      actions.push("Prioriser un point budget et marge sur ce chantier.");
    }

    if (analytics.remaining_budget_cents < 0) {
      actions.push(
        "Le budget est dépassé : sécuriser les prochaines dépenses."
      );
    }

    if (analytics.profit_cents < 0) {
      actions.push(
        "La marge est négative : revoir le chiffrage et les postes les plus coûteux."
      );
    }

    if (amountToCollectCents > 0) {
      actions.push(
        "Suivre le reste à encaisser pour limiter la tension de trésorerie du chantier."
      );
    }

    if (analytics.dominant_expense_category) {
      actions.push(
        `Contrôler le poste ${categoryLabel(
          analytics.dominant_expense_category
        ).toLowerCase()} qui concentre la plus grande part des dépenses.`
      );
    }

    return actions;
  }, [analytics, amountToCollectCents]);

  const refreshAll = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setErr(null);

    try {
      const [p, a, i, e] = await Promise.all([
        getProject(id),
        getProjectAnalytics(id),
        getProjectInsights(id),
        listProjectExpenses(id),
      ]);

      setProject(p);
      setAnalytics(a);
      setInsight(i);
      setExpenses(e);
    } catch {
      setErr("Impossible de charger le chantier.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  const handleAccountingImport = async (file: File) => {
    if (!id) return;

    setImportLoading(true);
    setErr(null);

    try {
      await importProjectAccountingFile(id, file);
      await refreshAll();
    } catch {
      setErr("Impossible d’importer le fichier comptable.");
    } finally {
      setImportLoading(false);
    }
  };

  if (!id) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 text-[var(--theme-text)] shadow-sm">
          Chantier introuvable.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 text-[var(--theme-text)] shadow-sm">
          Chargement du chantier…
        </div>
      </div>
    );
  }

  if (err || !analytics || !project) {
    return (
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700 shadow-sm">
          {err ?? "Erreur."}
        </div>
      </div>
    );
  }

  const revenue = analytics.revenue_cents;
  const paid = analytics.paid_cents;
  const expensesTotal = analytics.expenses_cents;
  const profit = analytics.profit_cents;
  const remainingBudget = analytics.remaining_budget_cents;

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-6 text-[var(--theme-text)] animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-[var(--theme-muted)]">
            <Link to="/dashboard" className="hover:underline">
              Dashboard
            </Link>{" "}
            / <span>Chantier</span>
          </div>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--theme-text)]">
            {project.name}
          </h1>
          <p className="mt-1 text-sm text-[var(--theme-muted)]">
            Analyse rentabilité & recommandations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label
            className={`inline-flex cursor-pointer items-center rounded-2xl px-4 py-2 text-sm font-semibold text-[var(--theme-primary-contrast)] transition-opacity hover:opacity-90 ${
              importLoading ? "opacity-70" : ""
            }`}
            style={{ backgroundColor: "var(--theme-primary)" }}
          >
            <span>
              {importLoading ? "Import en cours..." : "Importer fichier comptable"}
            </span>
            <input
              type="file"
              accept=".xlsx,.csv"
              className="hidden"
              disabled={importLoading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  void handleAccountingImport(file);
                }
                e.currentTarget.value = "";
              }}
            />
          </label>

          <div
            className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${healthBadgeClass(
              analytics.health_status
            )}`}
          >
            Santé chantier : {analytics.health_status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PROJECT_CANONICAL_LINKS.map((item) => {
          const Icon = item.icon;

          return (
            <Link
              key={item.title}
              to={item.to}
              className="group rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--theme-bg)] text-[var(--theme-primary)]">
                <Icon size={22} />
              </div>

              <div className="text-sm font-black text-[var(--theme-text)]">
                {item.title}
              </div>
              <p className="mt-2 min-h-[40px] text-xs leading-relaxed text-[var(--theme-muted)]">
                {item.description}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-[var(--theme-text)]">KPI</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-6">
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
            <div className="text-sm text-[var(--theme-muted)]">Facturé</div>
            <div className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
              {formatEurosFromCents(revenue)}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
            <div className="text-sm text-[var(--theme-muted)]">Encaissé</div>
            <div className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
              {formatEurosFromCents(paid)}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
            <div className="text-sm text-[var(--theme-muted)]">À encaisser</div>
            <div className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
              {formatEurosFromCents(amountToCollectCents)}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
            <div className="text-sm text-[var(--theme-muted)]">Dépenses</div>
            <div className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
              {formatEurosFromCents(expensesTotal)}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
            <div className="text-sm text-[var(--theme-muted)]">Marge</div>
            <div className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
              {formatEurosFromCents(profit)}
            </div>
          </div>

          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
            <div className="text-sm text-[var(--theme-muted)]">Rentabilité</div>
            <div className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
              {profitabilityLabel}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">Budget restant</div>
          <div className="mt-1 text-xl font-semibold text-[var(--theme-text)]">
            {formatEurosFromCents(remainingBudget)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">
            Lecture trésorerie chantier
          </div>
          <div className="mt-2 text-sm text-[var(--theme-text)]">
            {amountToCollectCents > 0
              ? `Le chantier a encore ${formatEurosFromCents(
                  amountToCollectCents
                )} à encaisser.`
              : "Aucun reste à encaisser détecté à ce stade."}
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--theme-text)]">
            Insight IA
          </h2>

          {insight ? (
            <div
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${riskBadgeClass(
                insight.risk_level
              )}`}
            >
              Risque : {insight.risk_level}
            </div>
          ) : null}
        </div>

        {!insight ? (
          <div className="text-sm text-[var(--theme-muted)]">
            Aucune analyse disponible.
          </div>
        ) : cleanedRecommendation ? (
          <div className="text-sm text-[var(--theme-text)]">
            {cleanedRecommendation}
          </div>
        ) : (
          <div className="text-sm text-[var(--theme-muted)]">
            Aucune synthèse IA disponible.
          </div>
        )}
      </div>

      {analytics.alerts.length > 0 ? (
        <div className="space-y-3 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--theme-text)]">
            Alertes
          </h2>
          <div className="space-y-2">
            {analytics.alerts.map((alert) => (
              <div
                key={alert.code}
                className={`rounded-xl px-4 py-3 text-sm ${
                  alert.level === "critical"
                    ? "border border-red-200 bg-red-50 text-red-700"
                    : alert.level === "warning"
                      ? "border border-amber-200 bg-amber-50 text-amber-700"
                      : "border border-blue-200 bg-blue-50 text-blue-700"
                }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {(insight?.actions?.length ?? 0) > 0 || keyActions.length > 0 ? (
        <div className="space-y-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
          <h2 className="text-lg font-semibold text-[var(--theme-text)]">
            Recommandations
          </h2>

          <div className="space-y-4">
            {insight?.findings?.length ? (
              <div>
                <div className="text-sm font-semibold text-[var(--theme-text)]">
                  Diagnostic IA
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--theme-text)]">
                  {insight.findings.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {insight?.issues?.length ? (
              <div>
                <div className="text-sm font-semibold text-[var(--theme-text)]">
                  Points d’attention
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--theme-text)]">
                  {insight.issues.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {insight?.actions?.length ? (
              <div>
                <div className="text-sm font-semibold text-[var(--theme-text)]">
                  Actions recommandées
                </div>
                <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-[var(--theme-text)]">
                  {insight.actions.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {categoryBreakdown.length > 0 || keyActions.length > 0 ? (
        <div className="space-y-4 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--theme-text)]">
              Actions
            </h2>

            {analytics.dominant_expense_category ? (
              <div className="text-sm font-medium text-[var(--theme-muted)]">
                Poste dominant :{" "}
                <span className="font-semibold text-[var(--theme-text)]">
                  {categoryLabel(analytics.dominant_expense_category)}
                </span>
              </div>
            ) : null}
          </div>

          {keyActions.length > 0 ? (
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--theme-text)]">
              {keyActions.map((action, idx) => (
                <li key={idx}>{action}</li>
              ))}
            </ul>
          ) : null}

          {categoryBreakdown.length > 0 ? (
            <div className="space-y-3">
              {categoryBreakdown.map((item) => (
                <div key={item.category} className="space-y-1">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[var(--theme-text)]">
                      {item.label}
                    </span>
                    <span className="text-[var(--theme-muted)]">
                      {formatEurosFromCents(item.amount)} •{" "}
                      {item.share.toFixed(1).replace(".", ",")} %
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[var(--theme-border)]">
                    <div
                      className="h-2 rounded-full"
                      style={{
                        width: `${Math.min(100, item.share)}%`,
                        backgroundColor: "var(--theme-primary)",
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-[var(--theme-text)]">
            Dernières dépenses
          </h2>

          <Link
            to={`/projects/${project.id}/expenses`}
            className="inline-flex items-center rounded-xl border border-[var(--theme-border)] px-4 py-2 text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
          >
            Voir toutes les dépenses
          </Link>
        </div>

        <ProjectExpensesPanel
          projectId={project.id}
          expenses={previewExpenses}
          onRefresh={refreshAll}
          showCreateForm={false}
        />
      </div>
    </div>
  );
}