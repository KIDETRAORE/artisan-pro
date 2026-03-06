// apps/frontend/src/pages/ProjectDashboard.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

function formatEurosFromCents(cents: number): string {
  const eur = (Math.round(cents) / 100).toFixed(2);
  return `${eur.replace(".", ",")} €`;
}

function healthBadgeClass(status: ProjectAnalytics["health_status"]): string {
  if (status === "critical") {
    return "bg-red-100 text-red-700 border border-red-200";
  }
  if (status === "warning") {
    return "bg-amber-100 text-amber-700 border border-amber-200";
  }
  return "bg-emerald-100 text-emerald-700 border border-emerald-200";
}

function riskBadgeClass(risk: ProjectInsight["risk_level"]): string {
  if (risk === "high") {
    return "bg-red-100 text-red-700 border border-red-200";
  }
  if (risk === "medium") {
    return "bg-amber-100 text-amber-700 border border-amber-200";
  }
  return "bg-emerald-100 text-emerald-700 border border-emerald-200";
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

export default function ProjectDashboard() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [analytics, setAnalytics] = useState<ProjectAnalytics | null>(null);
  const [insight, setInsight] = useState<ProjectInsight | null>(null);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [importLoading, setImportLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const profitabilityLabel = useMemo(() => {
    const r = analytics?.profitability_rate ?? 0;
    return `${r.toFixed(2).replace(".", ",")} %`;
  }, [analytics]);

  const categoryBreakdown = useMemo(() => {
    if (!analytics) return [];

    const total = analytics.expenses_cents;
    const entries = Object.entries(analytics.expenses_by_category) as Array<
      [
        "materials" | "labor" | "equipment" | "transport" | "other",
        number
      ]
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
    refreshAll();
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
    return <div className="p-4">Chantier introuvable.</div>;
  }

  if (loading) {
    return <div className="p-4">Chargement du chantier…</div>;
  }

  if (err || !analytics || !project) {
    return <div className="p-4 text-red-600">{err ?? "Erreur."}</div>;
  }

  const revenue = analytics.revenue_cents;
  const expensesTotal = analytics.expenses_cents;
  const profit = analytics.profit_cents;
  const remainingBudget = analytics.remaining_budget_cents;

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">
            <Link to="/dashboard" className="hover:underline">
              Dashboard
            </Link>{" "}
            / <span>Chantier</span>
          </div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-gray-500">
            Analyse rentabilité & recommandations
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="inline-flex cursor-pointer items-center rounded-2xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">
            {importLoading ? "Import en cours..." : "Importer fichier comptable"}
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

      <div className="grid grid-cols-1 gap-4 md:grid-cols-5">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Facturé</div>
          <div className="mt-1 text-xl font-semibold">
            {formatEurosFromCents(revenue)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Dépenses</div>
          <div className="mt-1 text-xl font-semibold">
            {formatEurosFromCents(expensesTotal)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Marge</div>
          <div className="mt-1 text-xl font-semibold">
            {formatEurosFromCents(profit)}
          </div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Rentabilité</div>
          <div className="mt-1 text-xl font-semibold">{profitabilityLabel}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-sm text-gray-500">Budget restant</div>
          <div className="mt-1 text-xl font-semibold">
            {formatEurosFromCents(remainingBudget)}
          </div>
        </div>
      </div>

      {analytics.alerts.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-lg font-semibold">Alertes chantier</h2>
          <div className="space-y-2">
            {analytics.alerts.map((alert) => (
              <div
                key={alert.code}
                className={`rounded-xl px-4 py-3 text-sm ${
                  alert.level === "critical"
                    ? "bg-red-50 text-red-700 border border-red-200"
                    : alert.level === "warning"
                    ? "bg-amber-50 text-amber-700 border border-amber-200"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {alert.message}
              </div>
            ))}
          </div>
        </div>
      )}

      {categoryBreakdown.length > 0 && (
        <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Répartition des dépenses</h2>

            {analytics.dominant_expense_category ? (
              <div className="text-sm font-medium text-gray-600">
                Poste dominant :{" "}
                <span className="font-semibold text-gray-900">
                  {categoryLabel(analytics.dominant_expense_category)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="space-y-3">
            {categoryBreakdown.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-gray-700">{item.label}</span>
                  <span className="text-gray-600">
                    {formatEurosFromCents(item.amount)} •{" "}
                    {item.share.toFixed(1).replace(".", ",")} %
                  </span>
                </div>
                <div className="h-2 rounded-full bg-gray-100">
                  <div
                    className="h-2 rounded-full bg-blue-600"
                    style={{ width: `${Math.min(100, item.share)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">
            Dernières dépenses
          </h2>

          <Link
            to={`/projects/${project.id}/expenses`}
            className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Voir toutes les dépenses
          </Link>
        </div>

        <ProjectExpensesPanel
          projectId={project.id}
          expenses={previewExpenses}
          onRefresh={refreshAll}
        />
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Analyse IA</h2>

          {insight && (
            <div
              className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest ${riskBadgeClass(
                insight.risk_level
              )}`}
            >
              Risque : {insight.risk_level}
            </div>
          )}
        </div>

        {!insight ? (
          <div className="text-sm text-gray-600">Aucune analyse disponible.</div>
        ) : (
          <div className="space-y-4">
            <div className="text-sm text-gray-700">{insight.recommendation}</div>

            {insight.findings?.length > 0 && (
              <div>
                <div className="text-sm font-semibold">Diagnostic IA</div>
                <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {insight.findings.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            {insight.issues?.length > 0 && (
              <div>
                <div className="text-sm font-semibold">Points d’attention</div>
                <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {insight.issues.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>
            )}

            {insight.actions?.length > 0 && (
              <div>
                <div className="text-sm font-semibold">Actions recommandées</div>
                <ul className="mt-1 list-disc pl-5 text-sm text-gray-700 space-y-1">
                  {insight.actions.map((x, idx) => (
                    <li key={idx}>{x}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}