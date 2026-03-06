// apps/frontend/src/components/projects/ProjectExpensesPanel.tsx
import React, { useMemo, useState } from "react";
import {
  createProjectExpense,
  deleteProjectExpense,
  type ProjectExpense,
} from "../../api/projects.api";

type Props = {
  projectId: string;
  expenses: ProjectExpense[];
  onRefresh: () => Promise<void> | void;
};

function formatCurrencyFromCents(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format((value ?? 0) / 100);
}

function eurosToCents(value: string): number {
  const normalized = value.replace(",", ".").trim();
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount < 0) return 0;
  return Math.round(amount * 100);
}

export default function ProjectExpensesPanel({
  projectId,
  expenses,
  onRefresh,
}: Props) {
  const [label, setLabel] = useState("");
  const [amount, setAmount] = useState("");
  const [vendor, setVendor] = useState("");
  const [occurredAt, setOccurredAt] = useState("");
  const [loading, setLoading] = useState(false);

  const totalExpenses = useMemo(() => {
    return expenses.reduce((sum, item) => sum + (item.amount_cents ?? 0), 0);
  }, [expenses]);

  const handleCreate = async () => {
    const amountCents = eurosToCents(amount);

    if (!label.trim() || amountCents <= 0) {
      return;
    }

    setLoading(true);
    try {
      await createProjectExpense(projectId, {
        label: label.trim(),
        amount_cents: amountCents,
        vendor: vendor.trim() ? vendor.trim() : null,
        occurred_at: occurredAt ? new Date(occurredAt).toISOString() : null,
      });

      setLabel("");
      setAmount("");
      setVendor("");
      setOccurredAt("");

      await onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (expenseId: string) => {
    setLoading(true);
    try {
      await deleteProjectExpense(expenseId);
      await onRefresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Dépenses chantier</h3>
          <p className="text-sm text-slate-500">
            Total dépenses : {formatCurrencyFromCents(totalExpenses)}
          </p>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="Libellé"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Montant (€)"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <input
          value={vendor}
          onChange={(e) => setVendor(e.target.value)}
          placeholder="Fournisseur (optionnel)"
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
        <input
          type="date"
          value={occurredAt}
          onChange={(e) => setOccurredAt(e.target.value)}
          className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-slate-400"
        />
      </div>

      <button
        type="button"
        onClick={handleCreate}
        disabled={loading}
        className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
      >
        Ajouter une dépense
      </button>

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-slate-500">
              <th className="py-3 pr-4 font-medium">Libellé</th>
              <th className="py-3 pr-4 font-medium">Montant</th>
              <th className="py-3 pr-4 font-medium">Fournisseur</th>
              <th className="py-3 pr-4 font-medium">Date</th>
              <th className="py-3 pr-0 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-6 text-center text-slate-500">
                  Aucune dépense pour ce chantier.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-slate-100">
                  <td className="py-3 pr-4 text-slate-900">{expense.label}</td>
                  <td className="py-3 pr-4 text-slate-900">
                    {formatCurrencyFromCents(expense.amount_cents)}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    {expense.vendor ?? "—"}
                  </td>
                  <td className="py-3 pr-4 text-slate-700">
                    {expense.occurred_at
                      ? new Date(expense.occurred_at).toLocaleDateString("fr-FR")
                      : "—"}
                  </td>
                  <td className="py-3 pr-0">
                    <button
                      type="button"
                      onClick={() => handleDelete(expense.id)}
                      disabled={loading}
                      className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      Supprimer
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}