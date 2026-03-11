// apps/frontend/src/pages/Projects.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Receipt, Wallet, Building2 } from "lucide-react";
import CreateProjectForm from "../components/projects/CreateProjectForm";
import { listProjects, type Project } from "../api/projects.api";
import AIInsightCard from "../components/ai/AIInsightCard";

function formatDate(value: string): string {
  try {
    return new Date(value).toLocaleDateString("fr-FR");
  } catch {
    return value;
  }
}

function formatCurrencyFromCents(value: number | null): string {
  if (value == null) return "—";

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value / 100);
}

function getStatusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Actif";
    case "paused":
      return "En pause";
    case "done":
      return "Terminé";
    default:
      return status;
  }
}

function getStatusClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "paused":
      return "bg-amber-50 text-amber-700 border-amber-200";
    case "done":
      return "bg-[var(--theme-bg)] text-[var(--theme-text)] border-[var(--theme-border)]";
    default:
      return "bg-[var(--theme-bg)] text-[var(--theme-text)] border-[var(--theme-border)]";
  }
}

const PROJECT_CANONICAL_ACTIONS = [
  {
    title: "Ventes chantier",
    description: "Consulter les factures clients liées au pilotage chantier.",
    to: "/sales-invoices",
    icon: Receipt,
  },
  {
    title: "Achats chantier",
    description:
      "Consulter les factures fournisseurs liées aux coûts chantier.",
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

export default function Projects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadProjects = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await listProjects();
      setProjects(data);
    } catch {
      setError("Impossible de charger les chantiers.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadProjects();
  }, []);

  const handleCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev]);
  };

  const projectsInsight = useMemo(() => {
    if (projects.length === 0) {
      return "Aucun chantier n'est encore enregistré. Créez votre premier chantier pour suivre vos budgets, vos statuts et identifier rapidement les priorités.";
    }

    const activeCount = projects.filter(
      (project) => project.status === "active"
    ).length;
    const pausedCount = projects.filter(
      (project) => project.status === "paused"
    ).length;
    const doneCount = projects.filter(
      (project) => project.status === "done"
    ).length;

    const budgets = projects
      .map((project) => project.budget_cents)
      .filter(
        (value): value is number =>
          typeof value === "number" && Number.isFinite(value)
      );

    const totalBudgetCents = budgets.reduce((sum, value) => sum + value, 0);
    const averageBudgetCents =
      budgets.length > 0 ? Math.round(totalBudgetCents / budgets.length) : 0;

    const topBudgetProject =
      [...projects]
        .filter(
          (project) =>
            typeof project.budget_cents === "number" &&
            Number.isFinite(project.budget_cents)
        )
        .sort((a, b) => (b.budget_cents ?? 0) - (a.budget_cents ?? 0))[0] ??
      null;

    const parts: string[] = [];

    parts.push(
      `${projects.length} chantier${projects.length > 1 ? "s" : ""} enregistré${
        projects.length > 1 ? "s" : ""
      }`
    );

    if (activeCount > 0) {
      parts.push(
        `${activeCount} actif${activeCount > 1 ? "s" : ""} à suivre en priorité`
      );
    }

    if (pausedCount > 0) {
      parts.push(`${pausedCount} en pause à réévaluer`);
    }

    if (doneCount > 0) {
      parts.push(`${doneCount} terminé${doneCount > 1 ? "s" : ""}`);
    }

    if (budgets.length > 0) {
      parts.push(
        `budget moyen de ${formatCurrencyFromCents(averageBudgetCents)}`
      );
    }

    if (topBudgetProject?.name) {
      parts.push(
        `chantier le plus engagé : ${topBudgetProject.name} (${formatCurrencyFromCents(
          topBudgetProject.budget_cents
        )})`
      );
    }

    parts.push(
      "chaque fiche chantier permet maintenant de piloter budget, marge, reste à encaisser et alertes métier"
    );

    return `${parts.join(" • ")}.`;
  }, [projects]);

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6 animate-in fade-in duration-700">
      <AIInsightCard
        title="Synthèse des chantiers"
        insight={projectsInsight}
      />

      <div>
        <div className="text-sm text-[var(--theme-muted)]">
          Accueil / Chantiers
        </div>
        <h1 className="text-3xl font-bold text-[var(--theme-text)]">
          Tous les chantiers
        </h1>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Vue détaillée des chantiers, budgets, statuts et accès au pilotage
          ventes / achats / paiements.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PROJECT_CANONICAL_ACTIONS.map((action) => {
          const Icon = action.icon;

          return (
            <Link
              key={action.title}
              to={action.to}
              className="group rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--theme-bg)] text-[var(--theme-primary)]">
                <Icon size={22} />
              </div>

              <div className="text-sm font-black text-[var(--theme-text)]">
                {action.title}
              </div>
              <p className="mt-2 min-h-[40px] text-xs leading-relaxed text-[var(--theme-muted)]">
                {action.description}
              </p>
            </Link>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-1">
          <CreateProjectForm onCreated={handleCreated} />
        </div>

        <div className="xl:col-span-2">
          <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-[var(--theme-text)]">
                Liste des chantiers
              </h3>

              <button
                type="button"
                onClick={() => void loadProjects()}
                className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
              >
                Rafraîchir
              </button>
            </div>

            {loading ? (
              <div className="mt-6 text-sm text-[var(--theme-muted)]">
                Chargement des chantiers…
              </div>
            ) : error ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : projects.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-[var(--theme-border)] px-4 py-6 text-sm text-[var(--theme-muted)]">
                Aucun chantier pour le moment.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--theme-border)] text-left text-[var(--theme-muted)]">
                      <th className="py-3 pr-4 font-medium">Nom</th>
                      <th className="py-3 pr-4 font-medium">Description</th>
                      <th className="py-3 pr-4 font-medium">Budget</th>
                      <th className="py-3 pr-4 font-medium">Statut</th>
                      <th className="py-3 pr-4 font-medium">Créé le</th>
                      <th className="py-3 pr-0 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr
                        key={project.id}
                        className="border-b border-[var(--theme-border)]"
                      >
                        <td className="py-3 pr-4 font-medium text-[var(--theme-text)]">
                          {project.name}
                        </td>
                        <td className="py-3 pr-4 text-[var(--theme-text)]">
                          {project.description?.trim() || "—"}
                        </td>
                        <td className="py-3 pr-4 text-[var(--theme-text)]">
                          {formatCurrencyFromCents(project.budget_cents)}
                        </td>
                        <td className="py-3 pr-4">
                          <span
                            className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium ${getStatusClass(
                              project.status
                            )}`}
                          >
                            {getStatusLabel(project.status)}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-[var(--theme-text)]">
                          {formatDate(project.created_at)}
                        </td>
                        <td className="py-3 pr-0">
                          <Link
                            to={`/projects/${project.id}`}
                            className="rounded-xl bg-[var(--theme-primary)] px-3 py-2 text-xs font-medium text-white hover:bg-[var(--theme-primary)]"
                          >
                            Ouvrir
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}