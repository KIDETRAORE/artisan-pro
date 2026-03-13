// apps/frontend/src/pages/Payments.tsx
import React, { useEffect, useMemo, useState } from "react";
import {
  createPayment,
  listPayments,
  updatePayment,
  type CreatePaymentInput,
  type Payment,
  type PaymentDirection,
  type PaymentStatus,
} from "../services/payments.api";

type FormState = {
  amount_cents: string;
  currency: string;
  payment_date: string;
  status: PaymentStatus;
  direction: PaymentDirection;
  reference: string;
  contact_id: string;
  project_id: string;
  sales_invoice_id: string;
  purchase_bill_id: string;
};

const DEFAULT_FORM: FormState = {
  amount_cents: "",
  currency: "EUR",
  payment_date: "",
  status: "pending",
  direction: "inbound",
  reference: "",
  contact_id: "",
  project_id: "",
  sales_invoice_id: "",
  purchase_bill_id: "",
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

function buildCreatePayload(form: FormState): CreatePaymentInput {
  return {
    amount_cents: toNullableCents(form.amount_cents),
    currency: normalizeNullableString(form.currency),
    payment_date: normalizeNullableString(form.payment_date),
    status: form.status,
    direction: form.direction,
    reference: normalizeNullableString(form.reference),
    contact_id: normalizeNullableString(form.contact_id),
    project_id: normalizeNullableString(form.project_id),
    sales_invoice_id: normalizeNullableString(form.sales_invoice_id),
    purchase_bill_id: normalizeNullableString(form.purchase_bill_id),
  };
}

function getDirectionLabel(
  direction: PaymentDirection | null | undefined
): string {
  switch (direction) {
    case "inbound":
      return "Entrant";
    case "outbound":
      return "Sortant";
    default:
      return "Entrant";
  }
}

function getStatusLabel(status: PaymentStatus | null | undefined): string {
  switch (status) {
    case "pending":
      return "En attente";
    case "processing":
      return "En cours";
    case "paid":
      return "Payé";
    case "failed":
      return "Échoué";
    case "cancelled":
      return "Annulé";
    case "refunded":
      return "Remboursé";
    default:
      return "En attente";
  }
}

export default function Payments(): React.ReactElement {
  const [items, setItems] = useState<Payment[]>([]);
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
        const amount = typeof item.amount_cents === "number" ? item.amount_cents : 0;

        if (item.direction === "inbound") {
          acc.inboundCents += amount;
        } else if (item.direction === "outbound") {
          acc.outboundCents += amount;
        }

        if (item.status === "paid") {
          acc.paidCents += amount;
        }

        if (item.status === "pending" || item.status === "processing") {
          acc.pendingCents += amount;
        }

        return acc;
      },
      {
        inboundCents: 0,
        outboundCents: 0,
        paidCents: 0,
        pendingCents: 0,
      }
    );
  }, [sortedItems]);

  async function loadData() {
    setLoading(true);
    setError("");

    try {
      const data = await listPayments();
      setItems(data);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de charger les paiements."
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
      await createPayment(payload);
      setForm(DEFAULT_FORM);
      setRefreshKey((prev) => prev + 1);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Impossible de créer le paiement."
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function handleStatusChange(paymentId: string, status: PaymentStatus) {
    setError("");

    try {
      await updatePayment(paymentId, { status });
      setItems((prev) =>
        prev.map((item) => (item.id === paymentId ? { ...item, status } : item))
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de mettre à jour le statut."
      );
    }
  }

  async function handleDirectionChange(
    paymentId: string,
    direction: PaymentDirection
  ) {
    setError("");

    try {
      await updatePayment(paymentId, { direction });
      setItems((prev) =>
        prev.map((item) =>
          item.id === paymentId ? { ...item, direction } : item
        )
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Impossible de mettre à jour le sens du paiement."
      );
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-[var(--theme-text)]">
          Paiements
        </h1>
        <p className="mt-1 text-sm text-[var(--theme-muted)]">
          Gère les encaissements et décaissements sur la couche canonique
          <code className="ml-1 rounded bg-[var(--theme-bg)] px-1 py-0.5 text-xs text-[var(--theme-text)]">
            payments
          </code>
          .
        </p>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">Entrants</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAmount(totalsSummary.inboundCents)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">Sortants</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAmount(totalsSummary.outboundCents)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">Payés</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAmount(totalsSummary.paidCents)}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
          <div className="text-sm text-[var(--theme-muted)]">En attente</div>
          <div className="mt-2 text-2xl font-semibold text-[var(--theme-text)]">
            {formatAmount(totalsSummary.pendingCents)}
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <h2 className="text-lg font-medium text-[var(--theme-text)]">
          Nouveau paiement
        </h2>

        <form className="mt-4 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Montant (centimes)
            </span>
            <input
              type="number"
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.amount_cents}
              onChange={(e) => updateForm("amount_cents", e.target.value)}
              placeholder="120000"
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
              Date de paiement
            </span>
            <input
              type="date"
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.payment_date}
              onChange={(e) => updateForm("payment_date", e.target.value)}
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
                updateForm("status", e.target.value as PaymentStatus)
              }
            >
              <option value="pending">En attente</option>
              <option value="processing">En cours</option>
              <option value="paid">Payé</option>
              <option value="failed">Échoué</option>
              <option value="cancelled">Annulé</option>
              <option value="refunded">Remboursé</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Sens
            </span>
            <select
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.direction}
              onChange={(e) =>
                updateForm("direction", e.target.value as PaymentDirection)
              }
            >
              <option value="inbound">Entrant</option>
              <option value="outbound">Sortant</option>
            </select>
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Référence
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.reference}
              onChange={(e) => updateForm("reference", e.target.value)}
              placeholder="VIR-2026-001"
            />
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

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Sales invoice ID
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.sales_invoice_id}
              onChange={(e) => updateForm("sales_invoice_id", e.target.value)}
              placeholder="UUID facture client"
            />
          </label>

          <label className="space-y-1">
            <span className="text-sm font-medium text-[var(--theme-text)]">
              Purchase bill ID
            </span>
            <input
              className="w-full rounded-xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-3 py-2 text-[var(--theme-text)]"
              value={form.purchase_bill_id}
              onChange={(e) => updateForm("purchase_bill_id", e.target.value)}
              placeholder="UUID facture fournisseur"
            />
          </label>

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-[var(--theme-primary-contrast)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Création..." : "Créer le paiement"}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium text-[var(--theme-text)]">
            Liste des paiements
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
            Aucun paiement trouvé.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="border-b border-[var(--theme-border)] text-left">
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Date
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Montant
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Sens
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Statut
                  </th>
                  <th className="px-3 py-2 font-medium text-[var(--theme-text)]">
                    Référence
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
                      {formatDate(item.payment_date)}
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {formatAmount(item.amount_cents, item.currency ?? "EUR")}
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[var(--theme-text)]"
                        value={
                          (item.direction as PaymentDirection | null) ?? "inbound"
                        }
                        onChange={(e) =>
                          void handleDirectionChange(
                            item.id,
                            e.target.value as PaymentDirection
                          )
                        }
                      >
                        <option value="inbound">
                          {getDirectionLabel("inbound")}
                        </option>
                        <option value="outbound">
                          {getDirectionLabel("outbound")}
                        </option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        className="rounded-lg border border-[var(--theme-border)] bg-[var(--theme-card)] px-2 py-1 text-[var(--theme-text)]"
                        value={(item.status as PaymentStatus | null) ?? "pending"}
                        onChange={(e) =>
                          void handleStatusChange(
                            item.id,
                            e.target.value as PaymentStatus
                          )
                        }
                      >
                        <option value="pending">{getStatusLabel("pending")}</option>
                        <option value="processing">
                          {getStatusLabel("processing")}
                        </option>
                        <option value="paid">{getStatusLabel("paid")}</option>
                        <option value="failed">{getStatusLabel("failed")}</option>
                        <option value="cancelled">
                          {getStatusLabel("cancelled")}
                        </option>
                        <option value="refunded">
                          {getStatusLabel("refunded")}
                        </option>
                      </select>
                    </td>
                    <td className="px-3 py-2 text-[var(--theme-text)]">
                      {item.reference || "—"}
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