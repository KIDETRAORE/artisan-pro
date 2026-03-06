// apps/frontend/src/pages/ProjectExpensesPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getProject,
  listProjectExpenses,
  type Project,
  type ProjectExpense,
  type ProjectExpenseCategory,
} from "../api/projects.api";
import ProjectExpensesPanel from "../components/projects/ProjectExpensesPanel";

function categoryLabel(category: ProjectExpenseCategory | null): string {
  if (category === "materials") return "Matériaux";
  if (category === "labor") return "Main d’œuvre";
  if (category === "equipment") return "Équipement";
  if (category === "transport") return "Transport";
  return "Autres";
}

function formatCurrencyFromCents(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format((value ?? 0) / 100);
}

export default function ProjectExpensesPage() {
  const { id } = useParams<{ id: string }>();

  const [project, setProject] = useState<Project | null>(null);
  const [expenses, setExpenses] = useState<ProjectExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, item) => sum + (item.amount_cents ?? 0), 0);
  }, [expenses]);

  const refreshAll = useCallback(async () => {
    if (!id) return;

    setLoading(true);
    setErr(null);

    try {
      const [projectData, expensesData] = await Promise.all([
        getProject(id),
        listProjectExpenses(id),
      ]);

      setProject(projectData);
      setExpenses(expensesData);
    } catch {
      setErr("Impossible de charger les dépenses du chantier.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  if (!id) {
    return <div className="p-4">Chantier introuvable.</div>;
  }

  if (loading) {
    return <div className="p-4">Chargement des dépenses…</div>;
  }

  if (err || !project) {
    return <div className="p-4 text-red-600">{err ?? "Erreur."}</div>;
  }

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-gray-500">
            <Link to="/dashboard" className="hover:underline">
              Dashboard
            </Link>{" "}
            /{" "}
            <Link to={`/projects/${project.id}`} className="hover:underline">
              Chantier
            </Link>{" "}
            / <span>Dépenses</span>
          </div>

          <h1 className="text-2xl font-semibold mt-1">
            Dépenses — {project.name}
          </h1>

          <p className="text-sm text-gray-500">
            Total dépenses : {formatCurrencyFromCents(totalExpenses)}
          </p>
        </div>

        <Link
          to={`/projects/${project.id}`}
          className="inline-flex items-center rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Retour au chantier
        </Link>
      </div>

      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Liste complète</h2>
          <div className="text-sm text-gray-500">
            {expenses.length} dépense{expenses.length > 1 ? "s" : ""}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-slate-500">
                <th className="py-3 pr-4 font-medium">Libellé</th>
                <th className="py-3 pr-4 font-medium">Montant</th>
                <th className="py-3 pr-4 font-medium">Catégorie</th>
                <th className="py-3 pr-0 font-medium">Date</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-slate-500">
                    Aucune dépense pour ce chantier.
                  </td>
                </tr>
              ) : (
                expenses.map((expense) => (
                  <tr key={expense.id} className="border-b border-slate-100">
                    <td className="py-3 pr-4 text-slate-900">
                      {expense.description}
                    </td>
                    <td className="py-3 pr-4 text-slate-900">
                      {formatCurrencyFromCents(expense.amount_cents)}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      {categoryLabel(expense.category)}
                    </td>
                    <td className="py-3 pr-0 text-slate-700">
                      {expense.expense_date
                        ? new Date(expense.expense_date).toLocaleDateString("fr-FR")
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <ProjectExpensesPanel
        projectId={project.id}
        expenses={expenses}
        onRefresh={refreshAll}
      />
    </div>
  );
}