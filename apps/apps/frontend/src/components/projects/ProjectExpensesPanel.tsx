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
  showCreateForm?: boolean;
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

function categoryLabel(
  category: "materials" | "labor" | "equipment" | "transport" | "other" | null
): string {
  if (category === "materials") return "Matériaux";
  if (category === "labor") return "Main d’œuvre";
  if (category === "equipment") return "Équipement";
  if (category === "transport") return "Transport";
  return "Autres";
}

export default function ProjectExpensesPanel({
  projectId,
  expenses,
  onRefresh,
  showCreateForm = true,
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
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--theme-text)]">
            Dépenses chantier
          </h3>
          <p className="text-sm text-[var(--theme-muted)]">
            Total dépenses : {formatCurrencyFromCents(totalExpenses)}
          </p>
        </div>
      </div>

      {showCreateForm ? (
        <>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Libellé"
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-primary)]"
            />
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Montant (€)"
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-primary)]"
            />
            <input
              value={vendor}
              onChange={(e) => setVendor(e.target.value)}
              placeholder="Fournisseur (optionnel)"
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none placeholder:text-[var(--theme-muted)] focus:border-[var(--theme-primary)]"
            />
            <input
              type="date"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
              className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-sm text-[var(--theme-text)] outline-none focus:border-[var(--theme-primary)]"
            />
          </div>

          <button
            type="button"
            onClick={handleCreate}
            disabled={loading}
            className="mt-3 rounded-xl px-4 py-2 text-sm font-medium text-[var(--theme-primary-contrast)] disabled:opacity-50"
            style={{ backgroundColor: "var(--theme-primary)" }}
          >
            Ajouter une dépense
          </button>
        </>
      ) : null}

      <div className="mt-6 overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--theme-border)] text-left text-[var(--theme-muted)]">
              <th className="py-3 pr-4 font-medium">Libellé</th>
              <th className="py-3 pr-4 font-medium">Montant</th>
              <th className="py-3 pr-4 font-medium">Catégorie</th>
              <th className="py-3 pr-4 font-medium">Date</th>
              <th className="py-3 pr-0 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {expenses.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="py-6 text-center text-[var(--theme-muted)]"
                >
                  Aucune dépense pour ce chantier.
                </td>
              </tr>
            ) : (
              expenses.map((expense) => (
                <tr
                  key={expense.id}
                  className="border-b border-[var(--theme-border)]"
                >
                  <td className="py-3 pr-4 text-[var(--theme-text)]">
                    {expense.description}
                  </td>
                  <td className="py-3 pr-4 text-[var(--theme-text)]">
                    {formatCurrencyFromCents(expense.amount_cents)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--theme-muted)]">
                    {categoryLabel(expense.category)}
                  </td>
                  <td className="py-3 pr-4 text-[var(--theme-muted)]">
                    {expense.expense_date
                      ? new Date(expense.expense_date).toLocaleDateString("fr-FR")
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