// apps/frontend/src/pages/DashboardQuotes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock, FileText } from "lucide-react";
import { Link } from "react-router-dom";
import { useComptaReportStore } from "../store/comptaReport.store";
import {
  listPendingQuotes,
  updateQuoteStatus,
  convertQuoteToInvoice,
  type Quote,
  type QuoteStatus,
} from "../api/quotes.api";

function formatEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function formatEurFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatQuoteAmount(quote: Quote): string {
  if (typeof quote.total_amount_cents === "number") {
    return formatEurFromCents(quote.total_amount_cents);
  }
  if (typeof quote.total_amount === "number") {
    return formatEur(quote.total_amount);
  }
  return "—";
}

function getQuoteDisplayTitle(quote: Quote): string {
  if (quote.title) return quote.title;
  if (quote.reference) return quote.reference;
  return `Devis #${quote.id.slice(0, 8)}`;
}

function getQuoteStatusLabel(status: string): string {
  const normalized = status.trim().toLowerCase();

  if (normalized === "pending") return "En attente";
  if (normalized === "sent") return "Envoyé";
  if (normalized === "open") return "Ouvert";
  if (normalized === "draft") return "Brouillon";
  if (normalized === "accepted") return "Accepté";
  if (normalized === "rejected" || normalized === "refused") return "Refusé";
  if (normalized === "expired") return "Expiré";
  if (normalized === "cancelled") return "Annulé";

  return status;
}

function getQuoteStatusClass(status: string): string {
  const normalized = status.trim().toLowerCase();

  if (normalized === "pending") {
    return "bg-amber-100 text-amber-700";
  }
  if (normalized === "sent" || normalized === "open") {
    return "bg-blue-100 text-blue-700";
  }
  if (normalized === "accepted") {
    return "bg-emerald-100 text-emerald-700";
  }
  if (normalized === "rejected" || normalized === "refused") {
    return "bg-red-100 text-red-700";
  }
  return "bg-[var(--theme-bg)] text-[var(--theme-text)]";
}

function canConvertQuote(quote: Quote): boolean {
  return (
    String(quote.status).trim().toLowerCase() === "accepted" && !quote.invoice_id
  );
}

export default function DashboardQuotes() {
  useComptaReportStore((s) => s.report);

  const [loading, setLoading] = useState(false);
  const [pendingQuotes, setPendingQuotes] = useState<Quote[]>([]);
  const [updatingQuoteId, setUpdatingQuoteId] = useState<string | null>(null);
  const [convertingQuoteId, setConvertingQuoteId] = useState<string | null>(
    null
  );
  const fetchOnceRef = useRef(false);

  useEffect(() => {
    if (fetchOnceRef.current) return;
    fetchOnceRef.current = true;

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const quotes = await listPendingQuotes();

        if (!cancelled) {
          setPendingQuotes(quotes);
        }
      } catch {
        if (!cancelled) setPendingQuotes([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const pendingCount = pendingQuotes.length;

  const analysis = useMemo(
    () => ({
      summary:
        pendingCount > 0
          ? `${pendingCount} devis en attente détecté(s) sur la base des statuts devis actuels.`
          : "Aucun devis en attente détecté pour le moment.",
      actions: [
        "Relancer en priorité les devis au statut “pending”, “sent” ou “open”.",
        "Suivre les devis les plus récents pour accélérer la conversion commerciale.",
        "Relier devis → facture pour mesurer le taux de transformation réel.",
        "Ajouter un rattachement chantier/projet pour un suivi commercial plus fin.",
      ],
    }),
    [pendingCount]
  );

  const reloadQuotes = async () => {
    const quotes = await listPendingQuotes();
    setPendingQuotes(quotes);
  };

  const handleStatusUpdate = async (quoteId: string, status: QuoteStatus) => {
    if (updatingQuoteId || convertingQuoteId) return;

    setUpdatingQuoteId(quoteId);

    try {
      await updateQuoteStatus(quoteId, status);
      await reloadQuotes();
    } catch {
      // best effort UI silencieuse à ce stade
    } finally {
      setUpdatingQuoteId(null);
    }
  };

  const handleConvertToInvoice = async (quoteId: string) => {
    if (updatingQuoteId || convertingQuoteId) return;

    setConvertingQuoteId(quoteId);

    try {
      await convertQuoteToInvoice(quoteId);
      await reloadQuotes();
    } catch {
      // best effort UI silencieuse à ce stade
    } finally {
      setConvertingQuoteId(null);
    }
  };

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
            Devis en attente
          </h2>
          <p className="mt-1 text-[var(--theme-muted)]">
            Analyse structurée des devis en attente basée sur les données
            réelles.
          </p>
        </div>

        <div className="hidden items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 shadow-sm sm:flex">
          <Clock className="text-amber-500" size={18} />
          <span className="text-sm font-black text-[var(--theme-text)]">
            {loading ? "…" : String(pendingCount)}
          </span>
          <span className="text-xs font-bold text-[var(--theme-muted)]">
            en attente
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl shadow-slate-200/50">
          <div className="border-b border-[var(--theme-border)] p-6">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">
              Analyse
            </h3>
            <p className="mt-1 text-[11px] font-medium text-[var(--theme-muted)]">
              Ce que l’écran peut faire dès maintenant.
            </p>
          </div>
          <div className="space-y-4 p-6">
            <p className="text-sm font-medium text-[var(--theme-text)]">
              {analysis.summary}
            </p>
            <ul className="space-y-2">
              {analysis.actions.map((a) => (
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

        <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl shadow-slate-200/50">
          <div className="border-b border-[var(--theme-border)] p-6">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">
              Devis à relancer
            </h3>
            <p className="mt-1 text-[11px] font-medium text-[var(--theme-muted)]">
              Liste réelle des devis en attente.
            </p>
          </div>

          <div className="space-y-3 p-6">
            {loading ? (
              <p className="text-xs font-medium text-[var(--theme-muted)]">
                Chargement des devis…
              </p>
            ) : pendingQuotes.length > 0 ? (
              pendingQuotes.slice(0, 10).map((quote) => (
                <div
                  key={quote.id}
                  className="rounded-2xl border border-[var(--theme-border)] px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-bg)] text-[var(--theme-muted)]">
                        <FileText size={16} />
                      </div>

                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-[var(--theme-text)]">
                          {getQuoteDisplayTitle(quote)}
                        </p>
                        <p className="truncate text-xs font-medium text-[var(--theme-muted)]">
                          {quote.client_name}
                        </p>
                      </div>
                    </div>

                    <div className="ml-4 text-right">
                      <div className="text-sm font-black text-[var(--theme-text)]">
                        {formatQuoteAmount(quote)}
                      </div>
                      <div
                        className={`mt-1 inline-flex rounded-lg px-2 py-1 text-[10px] font-black uppercase tracking-widest ${getQuoteStatusClass(
                          String(quote.status)
                        )}`}
                      >
                        {getQuoteStatusLabel(String(quote.status))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate(quote.id, "sent")}
                      disabled={
                        updatingQuoteId === quote.id ||
                        convertingQuoteId === quote.id
                      }
                      className="rounded-xl border border-[var(--theme-border)] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-[var(--theme-text)] hover:bg-[var(--theme-bg)] disabled:opacity-60"
                    >
                      Envoyer
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate(quote.id, "accepted")}
                      disabled={
                        updatingQuoteId === quote.id ||
                        convertingQuoteId === quote.id
                      }
                      className="rounded-xl border border-emerald-200 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                    >
                      Accepter
                    </button>
                    <button
                      type="button"
                      onClick={() => handleStatusUpdate(quote.id, "rejected")}
                      disabled={
                        updatingQuoteId === quote.id ||
                        convertingQuoteId === quote.id
                      }
                      className="rounded-xl border border-red-200 px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-red-700 hover:bg-red-50 disabled:opacity-60"
                    >
                      Refuser
                    </button>

                    {canConvertQuote(quote) ? (
                      <button
                        type="button"
                        onClick={() => handleConvertToInvoice(quote.id)}
                        disabled={
                          updatingQuoteId === quote.id ||
                          convertingQuoteId === quote.id
                        }
                        className="rounded-xl bg-[var(--theme-primary)] px-3 py-2 text-[11px] font-bold uppercase tracking-widest text-white hover:bg-blue-600 disabled:opacity-60"
                      >
                        Créer facture
                      </button>
                    ) : null}
                  </div>
                </div>
              ))
            ) : (
              <>
                <Link
                  to="/devis"
                  className="block rounded-2xl bg-[var(--theme-primary)] px-4 py-3 text-sm font-bold text-white transition-colors hover:bg-blue-600"
                >
                  Ouvrir le module Devis
                </Link>
                <Link
                  to="/dashboard"
                  className="block rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 text-sm font-bold text-[var(--theme-text)] transition-colors hover:border-blue-200 hover:bg-blue-50/30"
                >
                  Revenir au dashboard
                </Link>
                <p className="text-xs font-medium text-[var(--theme-muted)]">
                  Aucun devis en attente détecté pour le moment.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}