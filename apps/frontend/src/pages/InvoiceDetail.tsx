// apps/frontend/src/pages/InvoiceDetail.tsx
import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  createInvoiceDraft,
  deleteInvoice,
  deleteInvoiceLine,
  finalizeInvoice,
  getInvoice,
  listInvoiceLines,
  moneyCentsFromInvoice,
  patchInvoice,
  payInvoice,
  type Invoice,
  type InvoiceLine,
} from "../services/invoices.api";
import {
  getPennylaneInvoiceSyncEvents,
  resyncPennylaneInvoice,
  type PennylaneInvoiceSyncEvent,
} from "../services/integrations.api";
import InvoiceEditor from "../components/invoices/InvoiceEditor";
import InvoiceLinesEditor from "../components/invoices/InvoiceLinesEditor";
import { ApiRequestError } from "../utils/apiRequestError";

function formatEurFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

export default function InvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const invoiceId = String(id || "");
  const isCreateMode = invoiceId === "new" || invoiceId.length === 0;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [resyncLoading, setResyncLoading] = useState(false);
  const [syncEventsLoading, setSyncEventsLoading] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [syncEvents, setSyncEvents] = useState<PennylaneInvoiceSyncEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  const editorInvoice = useMemo<Invoice | null>(() => {
    if (invoice) return invoice;
    if (!isCreateMode) return null;

    return {
      id: "new",
      client_name: "",
      client_email: null,
      due_date: "",
      status: "draft",
      project_id: null,
      total_amount: 0,
      total_amount_cents: 0,
      subtotal_cents: 0,
      tax_amount_cents: 0,
      invoice_number: null,
      origin_type: "manual",
      source_system: "artisanpro",
      source_external_id: null,
      reminder_count: 0,
      last_reminder_at: null,
      paid_at: null,
      issue_date: null,
      stripe_checkout_id: null,
    };
  }, [invoice, isCreateMode]);

  const load = async () => {
    if (isCreateMode) {
      setError(null);
      setInvoice(null);
      setLines([]);
      return;
    }

    if (!invoiceId) return;

    setLoading(true);
    setError(null);

    try {
      const inv = await getInvoice(invoiceId);
      const lns = await listInvoiceLines(invoiceId);
      setInvoice(inv);
      setLines(lns);
    } catch {
      setError("Impossible de charger la facture.");
      setInvoice(null);
      setLines([]);
    } finally {
      setLoading(false);
    }
  };

  const loadSyncEvents = async () => {
    if (isCreateMode) {
      setSyncEvents([]);
      return;
    }

    if (!invoiceId) return;

    setSyncEventsLoading(true);
    try {
      const events = await getPennylaneInvoiceSyncEvents(invoiceId);
      setSyncEvents(events);
    } catch {
      setSyncEvents([]);
    } finally {
      setSyncEventsLoading(false);
    }
  };

  useEffect(() => {
    void load();
    void loadSyncEvents();
  }, [invoiceId, isCreateMode]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + (l.line_total_cents ?? 0), 0);
    const tax = lines.reduce((a, l) => {
      const rate = Number.isFinite(l.tax_rate) ? l.tax_rate : 0;
      return a + Math.round((l.line_total_cents ?? 0) * (rate / 100));
    }, 0);
    const total = subtotal + tax;

    return { subtotal, tax, total };
  }, [lines]);

  const status = String(invoice?.status ?? "").toLowerCase();

  const canEditHeader = useMemo(() => {
    if (isCreateMode) return true;
    if (!invoice) return false;
    return status === "draft" || status === "sent" || status === "overdue";
  }, [invoice, isCreateMode, status]);

  const canEditLines = useMemo(() => {
    if (isCreateMode) return true;
    if (!invoice) return false;
    return status === "draft";
  }, [invoice, isCreateMode, status]);

  const canDelete = useMemo(() => {
    if (!invoice) return false;
    return status === "draft";
  }, [invoice, status]);

  const editableFields = useMemo(
    () => ({
      client_name: isCreateMode || status === "draft",
      client_email:
        isCreateMode ||
        status === "draft" ||
        status === "sent" ||
        status === "overdue",
      due_date:
        isCreateMode ||
        status === "draft" ||
        status === "sent" ||
        status === "overdue",
      project_id:
        isCreateMode ||
        status === "draft" ||
        status === "sent" ||
        status === "overdue",
    }),
    [isCreateMode, status]
  );

  const canFinalize = useMemo(() => {
    if (!invoice) return false;
    if (status !== "draft" && status !== "sent") return false;
    return lines.length > 0;
  }, [invoice, status, lines.length]);

  const canPay = useMemo(() => {
    if (!invoice) return false;

    if (status === "paid" || status === "canceled") return false;

    const emailOk =
      !!invoice.client_email && String(invoice.client_email).trim().length > 0;
    if (!emailOk) return false;

    const amountCents = moneyCentsFromInvoice(invoice);
    return Number.isFinite(amountCents) && amountCents > 0;
  }, [invoice, status]);

  const canResyncPennylane = useMemo(() => {
    if (!invoice) return false;
    return status === "sent";
  }, [invoice, status]);

  const latestSyncEvent = useMemo(() => {
    return syncEvents.length > 0 ? syncEvents[0] : null;
  }, [syncEvents]);

  const onSaveHeader = async (patch: {
    client_name: string;
    client_email: string | null;
    due_date: string;
    project_id: string | null;
  }) => {
    if (!canEditHeader) return;

    setLoading(true);
    setError(null);

    try {
      if (isCreateMode && !invoice) {
        const created = await createInvoiceDraft({
          client_name: patch.client_name,
          client_email: patch.client_email,
          due_date: patch.due_date,
          project_id: patch.project_id,
          origin_type: "manual",
          source_system: "artisanpro",
          source_external_id: null,
        });

        setInvoice(created);
        navigate(`/invoices/${created.id}`, { replace: true });
        return;
      }

      if (!invoice) return;

      const updated = await patchInvoice(invoice.id, patch);
      setInvoice(updated);
    } catch (error) {
      if (error instanceof ApiRequestError) {
        setError(error.message);
      } else {
        setError("Impossible d’enregistrer les modifications.");
      }
    } finally {
      setLoading(false);
    }
  };

  const onFinalize = async () => {
    if (!invoice) return;

    if (lines.length === 0) {
      setError("Ajoute au moins une ligne avant de finaliser.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await finalizeInvoice(invoice.id);
      setInvoice(res.invoice);
      const lns = await listInvoiceLines(invoice.id);
      setLines(lns);
      await loadSyncEvents();
    } catch {
      setError("Finalisation impossible (vérifie lignes, permissions, backend).");
    } finally {
      setLoading(false);
    }
  };

  const onPay = async () => {
    if (!invoice) return;

    if (!invoice.client_email || String(invoice.client_email).trim().length === 0) {
      setError("Ajoute un email client pour activer le paiement Stripe.");
      return;
    }

    const amountCents = moneyCentsFromInvoice(invoice);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      setError("Le montant de la facture doit être supérieur à 0.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await payInvoice(invoice.id);
      const checkoutUrl = res.checkoutUrl;

      if (!checkoutUrl || typeof checkoutUrl !== "string") {
        setError("Impossible de démarrer le paiement (URL Stripe manquante).");
        return;
      }

      window.location.href = checkoutUrl;
    } catch {
      setError("Impossible de démarrer le paiement (Stripe).");
    } finally {
      setLoading(false);
    }
  };

  const onResyncPennylane = async () => {
    if (!invoice) return;

    setResyncLoading(true);
    setError(null);

    try {
      await resyncPennylaneInvoice(invoice.id);
      await loadSyncEvents();
    } catch {
      setError("Impossible de relancer la synchronisation Pennylane.");
    } finally {
      setResyncLoading(false);
    }
  };

  const onDeleteInvoice = async () => {
    if (!invoice || !canDelete) return;

    const confirmed = window.confirm(
      "Supprimer cette facture ? Cette action est irréversible."
    );
    if (!confirmed) return;

    setLoading(true);
    setError(null);

    try {
      for (const line of lines) {
        await deleteInvoiceLine(line.id);
      }

      await deleteInvoice(invoice.id);
      navigate("/invoices", { replace: true });
    } catch {
      setError("Impossible de supprimer la facture.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/invoices"
            className="inline-flex items-center gap-2 text-sm font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
          >
            <ArrowLeft size={16} /> Retour
          </Link>

          <h2 className="text-3xl font-extrabold text-[var(--theme-text)] tracking-tight mt-2">
            {isCreateMode ? "Nouvelle facture" : "Facture"}
          </h2>

          <p className="text-[var(--theme-muted)] mt-1">
            {isCreateMode
              ? "La facture sera créée lors de l’enregistrement."
              : invoice
                ? `#${invoice.id.slice(0, 8)}`
                : "Chargement…"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/invoices")}
            className="hidden sm:inline-flex items-center gap-2 bg-[var(--theme-card)] border border-[var(--theme-border)] text-[var(--theme-text)] px-4 py-3 rounded-2xl font-bold text-sm hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
          >
            Liste
          </button>

          <button
            onClick={onDeleteInvoice}
            disabled={loading || !canDelete}
            className="hidden sm:inline-flex items-center gap-2 bg-[var(--theme-card)] border border-red-200 text-red-700 px-4 py-3 rounded-2xl font-bold text-sm hover:bg-red-50 transition-colors disabled:opacity-60"
          >
            Supprimer
          </button>

          <button
            onClick={onResyncPennylane}
            disabled={!canResyncPennylane || resyncLoading || loading}
            className="inline-flex items-center gap-2 bg-[var(--theme-card)] border border-[var(--theme-border)] text-[var(--theme-text)] px-4 py-3 rounded-2xl font-bold text-sm hover:border-indigo-200 hover:bg-indigo-50/30 transition-colors disabled:opacity-60"
          >
            Resync Pennylane
          </button>

          <button
            onClick={onPay}
            disabled={!canPay || loading}
            className="inline-flex items-center gap-2 bg-[var(--theme-card)] border border-[var(--theme-border)] text-[var(--theme-text)] px-4 py-3 rounded-2xl font-bold text-sm hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors disabled:opacity-60"
          >
            Payer la facture
          </button>

          <button
            onClick={onFinalize}
            disabled={!canFinalize || loading}
            className="inline-flex items-center gap-2 bg-[var(--theme-primary)] text-white px-4 py-3 rounded-2xl font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            <CheckCircle2 size={16} /> Finaliser & Sync
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-[var(--theme-card)] border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5" />
          <div>{error}</div>
        </div>
      ) : null}

      {!isCreateMode && invoice ? (
        <div className="bg-[var(--theme-card)] border border-[var(--theme-border)] rounded-2xl p-4 text-sm text-[var(--theme-muted)]">
          {status === "draft"
            ? "Facture en brouillon : édition complète autorisée."
            : status === "sent" || status === "overdue"
              ? "Facture envoyée : seules les informations d’en-tête non sensibles restent modifiables. Les lignes sont verrouillées."
              : "Facture en lecture seule : aucune modification n’est autorisée."}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <InvoiceEditor
            loading={loading}
            invoice={editorInvoice}
            onSave={onSaveHeader}
            canEdit={canEditHeader}
            editableFields={editableFields}
          />

          <InvoiceLinesEditor
            loading={loading}
            invoiceId={invoice?.id ?? ""}
            lines={lines}
            onChangeLines={setLines}
            onReload={load}
            readOnly={!canEditLines}
          />
        </div>

        <div className="space-y-6">
          <div className="bg-[var(--theme-card)] rounded-3xl shadow-xl shadow-slate-200/50 border border-[var(--theme-border)] overflow-hidden">
            <div className="p-6 border-b border-[var(--theme-border)]">
              <h3 className="text-lg font-bold text-[var(--theme-text)]">Totaux</h3>
              <p className="text-[11px] text-[var(--theme-muted)] font-medium mt-1">
                Calculs en centimes (MVP).
              </p>
            </div>

            <div className="p-6 space-y-3">
              <Row label="Sous-total (HT)" value={formatEurFromCents(totals.subtotal)} />
              <Row label="TVA (estimée)" value={formatEurFromCents(totals.tax)} />
              <div className="h-px bg-[var(--theme-bg)] my-2" />
              <Row
                label="Total (TTC)"
                value={formatEurFromCents(totals.total)}
                strong
              />

              <div className="mt-4 text-xs text-[var(--theme-muted)] font-medium">
                Statut:{" "}
                <span className="font-black text-[var(--theme-text)]">
                  {status ? status.toUpperCase() : "—"}
                </span>
              </div>

              <div className="mt-4 text-xs text-[var(--theme-muted)] font-medium">
                Total enregistré (invoice):{" "}
                <span className="font-black text-[var(--theme-text)]">
                  {invoice ? formatEurFromCents(moneyCentsFromInvoice(invoice)) : "—"}
                </span>
              </div>

              <div className="mt-4 text-xs text-[var(--theme-muted)] font-medium">
                Chantier lié:{" "}
                <span className="font-black text-[var(--theme-text)]">
                  {invoice?.project_id ? invoice.project_id.slice(0, 8) : "Aucun"}
                </span>
              </div>

              <div className="mt-5 text-xs text-[var(--theme-muted)] font-medium">
                Pour déclencher la sync : au moins 1 ligne + finalisation.
              </div>
            </div>
          </div>

          <div className="bg-[var(--theme-card)] rounded-3xl shadow-xl shadow-slate-200/50 border border-[var(--theme-border)] overflow-hidden">
            <div className="p-6 border-b border-[var(--theme-border)]">
              <h3 className="text-lg font-bold text-[var(--theme-text)]">Sync Pennylane</h3>
            </div>

            <div className="p-6 space-y-3 text-sm text-[var(--theme-muted)]">
              {isCreateMode ? (
                <div>La synchronisation sera disponible après création de la facture.</div>
              ) : syncEventsLoading ? (
                <div>Chargement des événements…</div>
              ) : latestSyncEvent ? (
                <>
                  <div className="flex items-center justify-between">
                    <span>Dernier statut</span>
                    <span
                      className={`font-black uppercase tracking-widest text-xs ${
                        latestSyncEvent.status === "success"
                          ? "text-emerald-600"
                          : "text-red-600"
                      }`}
                    >
                      {latestSyncEvent.status}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span>Dernière tentative</span>
                    <span className="font-bold text-[var(--theme-text)]">
                      {new Date(latestSyncEvent.created_at).toLocaleString("fr-FR")}
                    </span>
                  </div>

                  <div className="pt-2 text-xs text-[var(--theme-muted)]">
                    Message : {latestSyncEvent.message ?? "—"}
                  </div>
                </>
              ) : (
                <div>Aucun événement de synchronisation pour cette facture.</div>
              )}
            </div>
          </div>

          <div className="bg-[var(--theme-card)] rounded-3xl shadow-xl shadow-slate-200/50 border border-[var(--theme-border)] overflow-hidden">
            <div className="p-6 border-b border-[var(--theme-border)]">
              <h3 className="text-lg font-bold text-[var(--theme-text)]">Recommandations</h3>
            </div>
            <div className="p-6 space-y-2 text-sm text-[var(--theme-muted)]">
              <Bullet>Créer en draft → lignes → finaliser.</Bullet>
              <Bullet>Rattacher la facture à un chantier pour alimenter les analytics.</Bullet>
              <Bullet>Garder les montants en centimes partout (cohérence).</Bullet>
              <Bullet>
                Si tu modifies des lignes après “sent”, refais “Finaliser & Sync”
                pour resync.
              </Bullet>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div
        className={`text-sm ${
          strong ? "font-bold text-[var(--theme-text)]" : "text-[var(--theme-muted)]"
        }`}
      >
        {label}
      </div>
      <div
        className={`text-sm ${
          strong ? "font-black text-[var(--theme-text)]" : "font-bold text-[var(--theme-text)]"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--theme-bg)]" />
      <div>{children}</div>
    </div>
  );
}