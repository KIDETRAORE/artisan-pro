// apps/frontend/src/components/projects/CreateProjectForm.tsx
import React, { useState } from "react";
import { createProject, type Project } from "../../api/projects.api";

type Props = {
  onCreated: (project: Project) => void;
};

export default function CreateProjectForm({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Le nom du chantier est requis.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        status,
      });

      setName("");
      setDescription("");
      setStatus("active");

      onCreated(project);
    } catch {
      setError("Impossible de créer le chantier.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-slate-900">
        Nouveau chantier
      </h3>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Nom
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Maison Dupont"
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Travaux, contexte, infos utiles…"
            rows={4}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Statut
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
          >
            <option value="active">Actif</option>
            <option value="paused">En pause</option>
            <option value="done">Terminé</option>
          </select>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={loading}
          className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          {loading ? "Création..." : "Créer le chantier"}
        </button>
      </form>
    </div>
  );
}