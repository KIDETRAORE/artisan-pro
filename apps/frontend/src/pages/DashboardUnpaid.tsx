// apps/frontend/src/pages/DashboardUnpaid.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import {
  listSalesInvoices,
  type SalesInvoice,
} from "../services/salesInvoices.api";

type DashboardResponse = {
  kpis?: {
    invoices?: {
      unpaidCount: number;
      unpaidTotalCents: number;
      overdueCount: number;
      overdueTotalCents: number;
      preview: Array<{
        id: string;
        client: string;
        totalAmountCents: number;
        dueDate: string;
        status: string;
        daysLate: number;
      }>;
    };
  };
};

type InvoiceRow = Pick<
  SalesInvoice,
  | "id"
  | "contact_id"
  | "invoice_number"
  | "status"
  | "due_date"
  | "total_cents"
  | "subtotal_cents"
  | "tax_cents"
>;

type KpiProps = {
  label: string;
  value: string;
  hint: string;
};

function formatEurFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatDateFr(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);
}

function invoiceAmountCents(inv: InvoiceRow): number {
  if (typeof inv.total_cents === "number") return inv.total_cents;
  return 0;
}

function getInvoiceDisplayClient(
  invoice: InvoiceRow,
  previewClientMap: Map<string, string>
): string {
  const fromPreview = previewClientMap.get(invoice.id);
  if (fromPreview && fromPreview.trim().length > 0) {
    return fromPreview;
  }

  if (invoice.contact_id && invoice.contact_id.trim().length > 0) {
    return `Contact ${invoice.contact_id.slice(0, 8)}`;
  }

  return "Client";
}

export default function DashboardUnpaid() {
  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<DashboardResponse["kpis"] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const fetchOnceRef = useRef(false);

  useEffect(() => {
    if (fetchOnceRef.current) return;
    fetchOnceRef.current = true;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const dash = await fetchWithAuth<DashboardResponse>("/dashboard", {
          method: "GET",
        });
        const inv = await listSalesInvoices();

        if (cancelled) return;

        setKpis(dash?.kpis ?? null);
        setInvoices((Array.isArray(inv) ? (inv as InvoiceRow[]) : []) ?? []);
      } catch {
        if (!cancelled) {
          setKpis(null);
          setInvoices([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const unpaidStatuses = useMemo(() => new Set(["sent", "overdue"]), []);
  const unpaid = useMemo(() => {
    return invoices
      .filter((i) => unpaidStatuses.has(String(i.status).toLowerCase()))
      .sort((a, b) => {
        const ad = new Date(String(a.due_date ?? "")).getTime();
        const bd = new Date(String(b.due_date ?? "")).getTime();

        if (ad !== bd) return ad - bd;
        return invoiceAmountCents(b) - invoiceAmountCents(a);
      });
  }, [invoices, unpaidStatuses]);

  const overdue = useMemo(() => {
    const now = Date.now();
    return unpaid.filter((i) => {
      const dueTs = new Date(String(i.due_date ?? "")).getTime();
      return Number.isFinite(dueTs) && dueTs < now;
    });
  }, [unpaid]);

  const unpaidTotalCents =
    kpis?.invoices?.unpaidTotalCents ??
    unpaid.reduce((a, it) => a + invoiceAmountCents(it), 0);

  const overdueTotalCents =
    kpis?.invoices?.overdueTotalCents ??
    overdue.reduce((a, it) => a + invoiceAmountCents(it), 0);

  const unpaidCount = kpis?.invoices?.unpaidCount ?? unpaid.length;
  const overdueCount = kpis?.invoices?.overdueCount ?? overdue.length;
  const preview = kpis?.invoices?.preview ?? [];

  const previewClientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of preview) {
      map.set(item.id, item.client);
    }
    return map;
  }, [preview]);

  const recommendations = useMemo(() => {
    const actions: string[] = [];

    if (overdueCount > 0) {
      actions.push(
        "Relancer en priorité les factures en retard avec un ordre clair par date d’échéance et montant."
      );
      actions.push(
        "Proposer un moyen de règlement immédiat pour réduire le délai de paiement."
      );
    }

    if (unpaidCount > 5) {
      actions.push(
        "Mettre en place une séquence de relance automatique J+1 / J+7 / J+15 sur les factures envoyées."
      );
    }

    if (unpaidTotalCents > 0 && overdueTotalCents > 0) {
      actions.push(
        "Séparer le traitement des factures simplement envoyées et des factures réellement en retard."
      );
    }

    actions.push(
      "Déclencher les synchronisations externes uniquement sur des factures finalisées avec lignes stables."
    );
    actions.push(
      "Suivre régulièrement le délai moyen de paiement pour sécuriser la trésorerie."
    );

    return actions;
  }, [overdueCount, unpaidCount, unpaidTotalCents, overdueTotalCents]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
          >
            <ArrowLeft size={16} /> Retour
          </Link>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--theme-text)]">
            Factures impayées
          </h2>
          <p className="mt-1 text-[var(--theme-muted)]">
            Pilotage trésorerie : impayés, retards et actions recommandées.
          </p>
        </div>

        <div className="hidden items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 shadow-sm sm:flex">
          <AlertTriangle className="text-red-500" size={18} />
          <span className="text-sm font-black text-[var(--theme-text)]">
            {loading ? "…" : formatEurFromCents(unpaidTotalCents)}
          </span>
          <span className="text-xs font-bold text-[var(--theme-muted)]">
            à encaisser
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <Kpi
          label="Impayés"
          value={loading ? "…" : String(unpaidCount)}
          hint="factures sent/overdue"
        />
        <Kpi
          label="Montant impayé"
          value={loading ? "…" : formatEurFromCents(unpaidTotalCents)}
          hint="total à encaisser"
        />
        <Kpi
          label="En retard"
          value={loading ? "…" : String(overdueCount)}
          hint="échéance dépassée"
        />
        <Kpi
          label="Montant en retard"
          value={loading ? "…" : formatEurFromCents(overdueTotalCents)}
          hint="priorité relance"
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl shadow-slate-200/50">
          <div className="border-b border-[var(--theme-border)] p-6">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">
              À relancer en priorité
            </h3>
            <p className="mt-1 text-[11px] font-medium text-[var(--theme-muted)]">
              Top impayés par retard puis montant.
            </p>
          </div>

          <div className="divide-y divide-[var(--theme-border)]">
            {preview.length > 0 ? (
              preview.map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between p-4"
                >
                  <div>
                    <p className="text-sm font-bold text-[var(--theme-text)]">
                      {it.client}
                    </p>
                    <p className="text-xs font-medium text-[var(--theme-muted)]">
                      Échéance : {formatDateFr(it.dueDate)}
                      {it.daysLate > 0 ? ` • ${it.daysLate}j de retard` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-black text-[var(--theme-text)]">
                    {formatEurFromCents(it.totalAmountCents)}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-[var(--theme-muted)]">
                Aucune relance prioritaire.
              </div>
            )}
          </div>
        </div>

        <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl shadow-slate-200/50">
          <div className="border-b border-[var(--theme-border)] p-6">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">
              Analyse & plan d’action
            </h3>
            <p className="mt-1 text-[11px] font-medium text-[var(--theme-muted)]">
              Suggestions pour améliorer la situation.
            </p>
          </div>
          <div className="p-6">
            <ul className="space-y-2">
              {recommendations.map((a) => (
                <li
                  key={a}
                  className="flex gap-3 text-sm text-[var(--theme-muted)]"
                >
                  <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-[var(--theme-bg)]" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl shadow-slate-200/50">
        <div className="flex items-center justify-between border-b border-[var(--theme-border)] p-6">
          <h3 className="text-lg font-bold text-[var(--theme-text)]">
            Toutes les factures impayées
          </h3>

          <div className="relative flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
              {loading ? "…" : `${unpaid.length} éléments`}
            </span>

            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-[var(--theme-border)] p-2 text-[var(--theme-muted)] hover:bg-[var(--theme-bg)] hover:text-[var(--theme-text)]"
              aria-label="Ouvrir le menu"
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-12 z-20 w-56 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-2 shadow-xl">
                <Link
                  to="/sales-invoices"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-[var(--theme-text)] hover:bg-[var(--theme-bg)]"
                >
                  Ouvrir les factures clients
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-[var(--theme-bg)]/60">
              <tr className="text-xs font-black uppercase tracking-widest text-[var(--theme-muted)]">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Échéance</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--theme-border)]">
              {unpaid.length > 0 ? (
                unpaid.map((it) => {
                  const status = String(it.status).toLowerCase();
                  const dueDate = String(it.due_date ?? "");
                  const dueTs = new Date(dueDate).getTime();
                  const overdueFlag = Number.isFinite(dueTs)
                    ? dueTs < Date.now()
                    : false;
                  const clientLabel = getInvoiceDisplayClient(
                    it,
                    previewClientMap
                  );

                  return (
                    <tr key={it.id} className="text-sm">
                      <td className="px-4 py-3 font-bold text-[var(--theme-text)]">
                        {clientLabel}
                      </td>
                      <td className="px-4 py-3 text-[var(--theme-muted)]">
                        {dueDate ? formatDateFr(dueDate) : "—"}
                        {overdueFlag ? " • en retard" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest ${
                            status === "overdue"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-[var(--theme-text)]">
                        {formatEurFromCents(invoiceAmountCents(it))}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td
                    className="px-4 py-6 text-sm text-[var(--theme-muted)]"
                    colSpan={4}
                  >
                    Aucune facture impayée.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: KpiProps) {
  return (
    <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-sm">
      <p className="text-sm font-medium text-[var(--theme-muted)]">{label}</p>
      <div className="mt-1 text-2xl font-black text-[var(--theme-text)]">
        {value}
      </div>
      <p className="mt-2 text-[11px] font-medium text-[var(--theme-muted)]">
        {hint}
      </p>
    </div>
  );
}