// apps/frontend/src/pages/InvoiceDetail.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertTriangle } from "lucide-react";
import {
  finalizeInvoice,
  getInvoice,
  listInvoiceLines,
  moneyCentsFromInvoice,
  patchInvoice,
  payInvoice,
  type Invoice,
  type InvoiceLine,
} from "../services/invoices.api";
import InvoiceEditor from "../components//invoices/InvoiceEditor";
import InvoiceLinesEditor from "../components/invoices/InvoiceLinesEditor";

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
  const navigate = useNavigate();

  const [loading, setLoading] = useState(false);
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [lines, setLines] = useState<InvoiceLine[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fetchOnceRef = useRef(false);

  const load = async () => {
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

  useEffect(() => {
    if (fetchOnceRef.current) return;
    fetchOnceRef.current = true;
    void load();
  }, [invoiceId]);

  const totals = useMemo(() => {
    const subtotal = lines.reduce((a, l) => a + (l.line_total_cents ?? 0), 0);
    // MVP: tax_rate appliquée par ligne (en %)
    const tax = lines.reduce((a, l) => {
      const rate = Number.isFinite(l.tax_rate) ? l.tax_rate : 0;
      return a + Math.round((l.line_total_cents ?? 0) * (rate / 100));
    }, 0);
    const total = subtotal + tax;

    return { subtotal, tax, total };
  }, [lines]);

  const canFinalize = useMemo(() => {
    const st = String(invoice?.status ?? "").toLowerCase();
    if (!invoice) return false;
    if (st !== "draft" && st !== "sent") return false;
    return lines.length > 0;
  }, [invoice, lines.length]);

  // ✅ AJOUT: paiement possible uniquement si facture existe, email client présent,
  // statut pas déjà payé/annulé et montant > 0.
  const canPay = useMemo(() => {
    if (!invoice) return false;

    const st = String(invoice.status ?? "").toLowerCase();
    if (st === "paid" || st === "canceled") return false;

    const emailOk = !!invoice.client_email && String(invoice.client_email).trim().length > 0;
    if (!emailOk) return false;

    const amountCents = moneyCentsFromInvoice(invoice);
    return Number.isFinite(amountCents) && amountCents > 0;
  }, [invoice]);

  const onSaveHeader = async (patch: {
    client_name: string;
    client_email: string | null;
    due_date: string;
  }) => {
    if (!invoice) return;
    setLoading(true);
    setError(null);
    try {
      const updated = await patchInvoice(invoice.id, patch);
      setInvoice(updated);
    } catch {
      setError("Impossible d’enregistrer les modifications.");
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
      // Option: s'assurer que le total est cohérent (MVP)
      // Si ton backend ignore total_amount, ça ne gêne pas.
      await patchInvoice(invoice.id, {
        total_amount_cents: totals.total,
      } as any);

      const res = await finalizeInvoice(invoice.id);
      setInvoice(res.invoice);
      // Reload lines too (si jamais backend recalcul)
      const lns = await listInvoiceLines(invoice.id);
      setLines(lns);
    } catch {
      setError("Finalisation impossible (vérifie lignes, permissions, backend).");
    } finally {
      setLoading(false);
    }
  };

  // ✅ AJOUT: déclenche Stripe Checkout
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

      const checkoutUrl = (res as any)?.checkoutUrl;
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

  const status = String(invoice?.status ?? "").toLowerCase();

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/invoices"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Retour
          </Link>

          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            Facture
          </h2>

          <p className="text-slate-500 mt-1">
            {invoice ? `#${invoice.id.slice(0, 8)}` : "Chargement…"}
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate("/invoices")}
            className="hidden sm:inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-2xl font-bold text-sm hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
          >
            Liste
          </button>

          {/* ✅ AJOUT: bouton payer */}
          <button
            onClick={onPay}
            disabled={!canPay || loading}
            className="inline-flex items-center gap-2 bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-2xl font-bold text-sm hover:border-emerald-200 hover:bg-emerald-50/30 transition-colors disabled:opacity-60"
          >
            Payer la facture
          </button>

          <button
            onClick={onFinalize}
            disabled={!canFinalize || loading}
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-4 py-3 rounded-2xl font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-60"
          >
            <CheckCircle2 size={16} /> Finaliser & Sync
          </button>
        </div>
      </div>

      {error ? (
        <div className="bg-white border border-red-100 rounded-2xl p-4 text-sm text-red-700 flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5" />
          <div>{error}</div>
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <InvoiceEditor
            loading={loading}
            invoice={invoice}
            onSave={onSaveHeader}
          />

          <InvoiceLinesEditor
            loading={loading}
            invoiceId={invoiceId}
            lines={lines}
            onChangeLines={setLines}
            onReload={load}
          />
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h3 className="text-lg font-bold text-slate-900">Totaux</h3>
              <p className="text-[11px] text-slate-500 font-medium mt-1">
                Calculs en centimes (MVP).
              </p>
            </div>

            <div className="p-6 space-y-3">
              <Row label="Sous-total (HT)" value={formatEurFromCents(totals.subtotal)} />
              <Row label="TVA (estimée)" value={formatEurFromCents(totals.tax)} />
              <div className="h-px bg-slate-100 my-2" />
              <Row
                label="Total (TTC)"
                value={formatEurFromCents(totals.total)}
                strong
              />

              <div className="mt-4 text-xs text-slate-400 font-medium">
                Statut:{" "}
                <span className="font-black text-slate-700">
                  {status ? status.toUpperCase() : "—"}
                </span>
              </div>

              <div className="mt-4 text-xs text-slate-400 font-medium">
                Total enregistré (invoice):{" "}
                <span className="font-black text-slate-700">
                  {invoice ? formatEurFromCents(moneyCentsFromInvoice(invoice)) : "—"}
                </span>
              </div>

              <div className="mt-5 text-xs text-slate-400 font-medium">
                Pour déclencher la sync : au moins 1 ligne + finalisation.
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h3 className="text-lg font-bold text-slate-900">Recommandations</h3>
            </div>
            <div className="p-6 space-y-2 text-sm text-slate-600">
              <Bullet>Créer en draft → lignes → finaliser.</Bullet>
              <Bullet>Garder les montants en centimes partout (cohérence).</Bullet>
              <Bullet>Si tu modifies des lignes après “sent”, refais “Finaliser & Sync” pour resync.</Bullet>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, strong }: any) {
  return (
    <div className="flex items-center justify-between">
      <div className={`text-sm ${strong ? "font-bold text-slate-900" : "text-slate-600"}`}>
        {label}
      </div>
      <div className={`text-sm ${strong ? "font-black text-slate-900" : "font-bold text-slate-900"}`}>
        {value}
      </div>
    </div>
  );
}

function Bullet({ children }: any) {
  return (
    <div className="flex gap-3">
      <span className="mt-2 w-1.5 h-1.5 rounded-full bg-slate-300" />
      <div>{children}</div>
    </div>
  );
}