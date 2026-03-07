// apps/frontend/src/pages/Projects.tsx
import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import CreateProjectForm from "../components/projects/CreateProjectForm";
import { listProjects, type Project } from "../api/projects.api";

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
      return "bg-slate-100 text-slate-700 border-slate-200";
    default:
      return "bg-slate-100 text-slate-700 border-slate-200";
  }
}

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

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="text-3xl font-bold text-[var(--theme-text)]">Chantiers</h1>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Suivi des chantiers, rentabilité et dépenses.
        </p>
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
                className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm font-medium text-[var(--theme-text)] hover:bg-slate-50"
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
                      <tr key={project.id} className="border-b border-[var(--theme-border)]">
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
                            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-medium text-white hover:bg-slate-800"
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