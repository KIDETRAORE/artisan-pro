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
    loadProjects();
  }, []);

  const handleCreated = (project: Project) => {
    setProjects((prev) => [project, ...prev]);
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">Chantiers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Suivi des chantiers, rentabilité et dépenses.
        </p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-1">
          <CreateProjectForm onCreated={handleCreated} />
        </div>

        <div className="xl:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <h3 className="text-lg font-semibold text-slate-900">
                Liste des chantiers
              </h3>

              <button
                type="button"
                onClick={loadProjects}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Rafraîchir
              </button>
            </div>

            {loading ? (
              <div className="mt-6 text-sm text-slate-500">
                Chargement des chantiers…
              </div>
            ) : error ? (
              <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            ) : projects.length === 0 ? (
              <div className="mt-6 rounded-xl border border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500">
                Aucun chantier pour le moment.
              </div>
            ) : (
              <div className="mt-6 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 text-left text-slate-500">
                      <th className="py-3 pr-4 font-medium">Nom</th>
                      <th className="py-3 pr-4 font-medium">Description</th>
                      <th className="py-3 pr-4 font-medium">Statut</th>
                      <th className="py-3 pr-4 font-medium">Créé le</th>
                      <th className="py-3 pr-0 font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {projects.map((project) => (
                      <tr key={project.id} className="border-b border-slate-100">
                        <td className="py-3 pr-4 text-slate-900 font-medium">
                          {project.name}
                        </td>
                        <td className="py-3 pr-4 text-slate-700">
                          {project.description?.trim() || "—"}
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
                        <td className="py-3 pr-4 text-slate-700">
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