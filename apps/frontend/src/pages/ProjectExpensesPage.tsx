// apps/frontend/src/pages/ProjectExpensesPage.tsx
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getProject,
  listProjectExpenses,
  type Project,
  type ProjectExpense,
} from "../api/projects.api";
import ProjectExpensesPanel from "../components/projects/ProjectExpensesPanel";

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

          <h1 className="mt-1 text-2xl font-semibold">
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

      <ProjectExpensesPanel
        projectId={project.id}
        expenses={expenses}
        onRefresh={refreshAll}
        showCreateForm
      />
    </div>
  );
}