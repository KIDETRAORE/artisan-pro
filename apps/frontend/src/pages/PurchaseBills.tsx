// apps/frontend/src/pages/PurchaseBills.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  createPurchaseBill,
  listPurchaseBills,
  updatePurchaseBill,
  type CreatePurchaseBillInput,
  type PurchaseBill,
  type PurchaseBillStatus,
} from "../services/purchaseBills.api";

type FormState = {
  bill_number: string;
  issue_date: string;
  due_date: string;
  total_amount_cents: string;
  currency: string;
  status: PurchaseBillStatus;
  contact_id: string;
  project_id: string;
};

const DEFAULT_FORM: FormState = {
  bill_number: "",
  issue_date: "",
  due_date: "",
  total_amount_cents: "",
  currency: "EUR",
  status: "received",
  contact_id: "",
  project_id: "",
};

function formatAmount(amountCents: number | null, currency = "EUR"): string {
  if (typeof amountCents !== "number") {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency,
  }).format(amountCents / 100);
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("fr-FR").format(date);
}

function normalizeNullableString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNullableCents(value: string): number | null {
  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  const amount = Number(trimmed);
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function buildCreatePayload(form: FormState): CreatePurchaseBillInput {
  return {
    bill_number: normalizeNullableString(form.bill_number),
    issue_date: normalizeNullableString(form.issue_date),
    due_date: normalizeNullableString(form.due_date),
    total_amount_cents: toNullableCents(form.total_amount_cents),
    currency: normalizeNullableString(form.currency),
    status: form.status,
    contact_id: normalizeNullableString(form.contact_id),
    project_id: normalizeNullableString(form.project_id),
  };
}

function getStatusLabel(status: PurchaseBillStatus | null | undefined): string {
  switch (status) {
    case "draft":
      return "Brouillon";
    case "received":
      return "Reçue";
    case "partial":
      return "Partielle";
    case "paid":
      return "Payée";
    case "overdue":
      return "En retard";
    case "cancelled":
      return "Annulée";
    default:
      return "Reçue";
  }
}

export default function PurchaseBills(): React.ReactElement {
  const [items, setItems] = useState<PurchaseBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [form, setForm] = useState<FormState>(DEFAULT_FORM);

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      const aDate = new Date(a.created_at ?? 0).getTime();
      const bDate = new Date(b.created_at ?? 0).getTime();
      return bDate - aDate;
    });
  }, [items]);

  const totalsSummary = useMemo(() => {
    return sortedItems.reduce(
      (acc, item) => {
        if (typeof item.total_amount_cents === "number") {
          acc.totalCents += item.total_amount_cents;
        }

        if (item.status === "paid" && typeof item.total_amount_cents === "number") {
          acc.paidCents += item.total_amount_cents;
        }

        if (
          (item.status === "received" ||
            item.status === "partial" ||
            item.status === "overdue") &&
          typeof item.total_amount_cents === "number"
        ) {
          acc.outstandingCents += item.total_amount_cents;
        }

        return acc;
      },
      {
        totalCents: 0,
        paidCents: 0,
        outstandingCents: 0,
      }
    );
  }, [sortedItems]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const data = await listPurchaseBills();
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les factures fournisseurs."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [refreshKey]);

  function updateForm<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({
      ...prev,
      [key]: value,
    }));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError("");

    try {
      const payload = buildCreatePayload(form);
      await createPurchaseBill(payload);
      setForm(DEFAULT_FORM);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de créer la facture fournisseur."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(
    purchaseBillId: string,
    status: PurchaseBillStatus
  ) {
    setError("");

    try {
      await updatePurchaseBill(purchaseBillId, { status });
      setItems((prev) =>
        prev.map((item) =>
          item.id === purchaseBillId ? { ...item, status } : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de mettre à jour le statut."
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--theme-text)]">
          Factures fournisseurs
        </h1>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Gère les factures fournisseurs sur la couche canonique
          <code className="ml-1 rounded bg-[var(--theme-bg)] px-1 py-0.5 text-xs text-[var(--theme-text)]">
            purchase_bills
          </code>
          .
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">
            Total fournisseurs
          </div>
          <div className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAmount(totalsSummary.totalCents)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">Total payé</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAmount(totalsSummary.paidCents)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">Reste à payer</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAmount(totalsSummary.outstandingCents)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--theme-text)]">
          Nouvelle facture fournisseur
        </h2>

        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Numéro de facture
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.bill_number}
              onChange={(e) => updateForm("bill_number", e.target.value)}
              placeholder="FOUR-2026-001"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Devise
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.currency}
              onChange={(e) => updateForm("currency", e.target.value)}
              placeholder="EUR"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Date d’émission
            </span>
            <input
              type="date"
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.issue_date}
              onChange={(e) => updateForm("issue_date", e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Date d’échéance
            </span>
            <input
              type="date"
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.due_date}
              onChange={(e) => updateForm("due_date", e.target.value)}
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Montant (centimes)
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.total_amount_cents}
              onChange={(e) => updateForm("total_amount_cents", e.target.value)}
              placeholder="99000"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Statut
            </span>
            <select
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.status}
              onChange={(e) =>
                updateForm("status", e.target.value as PurchaseBillStatus)
              }
            >
              <option value="draft">Brouillon</option>
              <option value="received">Reçue</option>
              <option value="partial">Partielle</option>
              <option value="paid">Payée</option>
              <option value="overdue">En retard</option>
              <option value="cancelled">Annulée</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Contact ID
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.contact_id}
              onChange={(e) => updateForm("contact_id", e.target.value)}
              placeholder="UUID contact"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Projet / chantier ID
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.project_id}
              onChange={(e) => updateForm("project_id", e.target.value)}
              placeholder="UUID projet"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-[var(--theme-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Création..." : "Créer la facture fournisseur"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-[var(--theme-text)]">
            Liste des factures fournisseurs
          </h2>
          <button
            type="button"
            onClick={() => setRefreshKey((prev) => prev + 1)}
            className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-sm text-[var(--theme-text)]"
          >
            Rafraîchir
          </button>
        </div>

        {loading ? (
          <div className="mt-4 text-sm text-[var(--theme-muted)]">
            Chargement...
          </div>
        ) : sortedItems.length === 0 ? (
          <div className="mt-4 text-sm text-[var(--theme-muted)]">
            Aucune facture fournisseur trouvée.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--theme-border)] text-left">
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Numéro
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Émission
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Échéance
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Montant
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Statut
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Source
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    ID
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr
                    key={item.id}
                    className="border-b border-[var(--theme-border)]"
                  >
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {item.bill_number || "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {formatDate(item.issue_date)}
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {formatDate(item.due_date)}
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {formatAmount(
                        item.total_amount_cents,
                        item.currency ?? "EUR"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[var(--theme-text)]"
                        value={
                          (item.status as PurchaseBillStatus | null) ?? "received"
                        }
                        onChange={(e) =>
                          void handleStatusChange(
                            item.id,
                            e.target.value as PurchaseBillStatus
                          )
                        }
                      >
                        <option value="draft">{getStatusLabel("draft")}</option>
                        <option value="received">
                          {getStatusLabel("received")}
                        </option>
                        <option value="partial">
                          {getStatusLabel("partial")}
                        </option>
                        <option value="paid">{getStatusLabel("paid")}</option>
                        <option value="overdue">
                          {getStatusLabel("overdue")}
                        </option>
                        <option value="cancelled">
                          {getStatusLabel("cancelled")}
                        </option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {item.source_system || "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--theme-muted)]">
                      {item.id}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}