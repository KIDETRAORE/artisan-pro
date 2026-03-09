// apps/frontend/src/components/projects/CreateProjectForm.tsx
import React, { useState } from "react";
import { createProject, type Project } from "../../api/projects.api";

type Props = {
  onCreated: (project: Project) => void;
};

function eurosToCents(value: string): number | null {
  const normalized = value.replace(",", ".").trim();
  if (!normalized) return null;

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return null;

  return Math.round(parsed * 100);
}

export default function CreateProjectForm({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [budget, setBudget] = useState("");
  const [status, setStatus] = useState("active");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("Le nom du chantier est requis.");
      return;
    }

    const budgetCents = eurosToCents(budget);
    if (budget.trim() && budgetCents === null) {
      setError("Le budget doit être un nombre valide.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const project = await createProject({
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        status,
        budget_cents: budgetCents,
      });

      setName("");
      setDescription("");
      setBudget("");
      setStatus("active");

      onCreated(project);
    } catch {
      setError("Impossible de créer le chantier.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--theme-text)]">
        Nouveau chantier
      </h3>

      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--theme-text)]">
            Nom
          </label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: Maison Dupont"
            className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-border)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--theme-text)]">
            Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Travaux, contexte, infos utiles…"
            rows={4}
            className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-border)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--theme-text)]">
            Budget (€)
          </label>
          <input
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
            placeholder="Ex: 5000"
            className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-border)]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[var(--theme-text)]">
            Statut
          </label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-border)]"
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
          className="rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--theme-primary)] disabled:opacity-50"
        >
          {loading ? "Création..." : "Créer le chantier"}
        </button>
      </form>
    </div>
  );
}