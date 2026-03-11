// apps/frontend/src/pages/SalesInvoices.tsx

import React, { useEffect, useMemo, useState } from "react";
import {
  createSalesInvoice,
  listSalesInvoices,
  updateSalesInvoice,
  type CreateSalesInvoiceInput,
  type SalesInvoice,
  type SalesInvoiceStatus,
} from "../services/salesInvoices.api";

type FormState = {
  invoice_number: string;
  issue_date: string;
  due_date: string;
  total_amount_cents: string;
  currency: string;
  status: SalesInvoiceStatus;
  contact_id: string;
  project_id: string;
};

const DEFAULT_FORM: FormState = {
  invoice_number: "",
  issue_date: "",
  due_date: "",
  total_amount_cents: "",
  currency: "EUR",
  status: "sent",
  contact_id: "",
  project_id: "",
};

function formatAmount(amountCents: number | null): string {
  if (typeof amountCents !== "number") {
    return "—";
  }

  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
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

function buildCreatePayload(form: FormState): CreateSalesInvoiceInput {
  const amount =
    form.total_amount_cents.trim().length > 0
      ? Number(form.total_amount_cents)
      : null;

  return {
    invoice_number: normalizeNullableString(form.invoice_number),
    issue_date: normalizeNullableString(form.issue_date),
    due_date: normalizeNullableString(form.due_date),
    total_amount_cents:
      typeof amount === "number" && Number.isFinite(amount)
        ? Math.round(amount)
        : null,
    currency: normalizeNullableString(form.currency),
    status: form.status,
    contact_id: normalizeNullableString(form.contact_id),
    project_id: normalizeNullableString(form.project_id),
  };
}

export default function SalesInvoices(): React.ReactElement {
  const [items, setItems] = useState<SalesInvoice[]>([]);
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

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const data = await listSalesInvoices();
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les factures clients."
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
      await createSalesInvoice(payload);
      setForm(DEFAULT_FORM);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de créer la facture client."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(
    salesInvoiceId: string,
    status: SalesInvoiceStatus
  ) {
    try {
      await updateSalesInvoice(salesInvoiceId, { status });
      setItems((prev) =>
        prev.map((item) =>
          item.id === salesInvoiceId ? { ...item, status } : item
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
          Factures clients
        </h1>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Gère les factures clients sur la nouvelle couche canonique
          <code className="ml-1 rounded bg-[var(--theme-bg)] px-1 py-0.5 text-xs text-[var(--theme-text)]">
            sales_invoices
          </code>
          .
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--theme-text)]">
          Nouvelle facture client
        </h2>

        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Numéro de facture
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.invoice_number}
              onChange={(e) => updateForm("invoice_number", e.target.value)}
              placeholder="FAC-2026-001"
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
              onChange={(e) =>
                updateForm("total_amount_cents", e.target.value)
              }
              placeholder="125000"
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
                updateForm("status", e.target.value as SalesInvoiceStatus)
              }
            >
              <option value="draft">Brouillon</option>
              <option value="sent">Envoyée</option>
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
              {submitting ? "Création..." : "Créer la facture client"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-[var(--theme-text)]">
            Liste des factures clients
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
            Aucune facture client trouvée.
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
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {sortedItems.map((item) => (
                  <tr key={item.id} className="border-b border-[var(--theme-border)]">
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {item.invoice_number || "—"}
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {formatDate(item.issue_date)}
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {formatDate(item.due_date)}
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {formatAmount(item.total_amount_cents)}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[var(--theme-text)]"
                        value={
                          (item.status as SalesInvoiceStatus | null) ?? "sent"
                        }
                        onChange={(e) =>
                          void handleStatusChange(
                            item.id,
                            e.target.value as SalesInvoiceStatus
                          )
                        }
                      >
                        <option value="draft">Brouillon</option>
                        <option value="sent">Envoyée</option>
                        <option value="partial">Partielle</option>
                        <option value="paid">Payée</option>
                        <option value="overdue">En retard</option>
                        <option value="cancelled">Annulée</option>
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