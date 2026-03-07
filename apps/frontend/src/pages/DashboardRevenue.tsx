// apps/frontend/src/pages/DashboardRevenue.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useComptaReportStore } from "../store/comptaReport.store";

type DashboardResponse = {
  kpis?: {
    revenue?: { paidAllTimeCents: number; paidMonthCents: number };
  };
};

type InvoiceRow = {
  id: string;
  client_name: string;
  status: string;
  created_at: string;
  total_amount_cents?: number | null;
  total_amount?: number | null;
};

function formatEurFromCents(cents: number): string {
  const euros = (Number.isFinite(cents) ? cents : 0) / 100;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(euros);
}

function formatEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

function startOfCurrentMonthIso(): string {
  const now = new Date();
  const d = new Date(now);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function invoiceAmountCents(inv: InvoiceRow): number {
  if (typeof inv.total_amount_cents === "number") return inv.total_amount_cents;
  if (typeof inv.total_amount === "number") return Math.round(inv.total_amount * 100);
  return 0;
}

export default function DashboardRevenue() {
  const report = useComptaReportStore((s) => s.report);

  const [loading, setLoading] = useState(false);
  const [kpis, setKpis] = useState<DashboardResponse["kpis"] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
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

        const inv = await fetchWithAuth<unknown>("/invoices", { method: "GET" });

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

  const monthStartIso = useMemo(() => startOfCurrentMonthIso(), []);

  const paidMonth = useMemo(() => {
    return invoices
      .filter((i) => String(i.status).toLowerCase() === "paid")
      .filter((i) => new Date(i.created_at).toISOString() >= monthStartIso)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }, [invoices, monthStartIso]);

  const paidMonthTotalCents = useMemo(() => {
    return paidMonth.reduce((acc, it) => acc + invoiceAmountCents(it), 0);
  }, [paidMonth]);

  const hasComptaReport = !!report;
  const recettesHT = report?.totals?.recettesHT ?? 0;
  const recettesTTC = report?.totals?.recettesTTC ?? 0;
  const parMois = report?.breakdown?.parMois ?? [];
  const topRecettes = report?.breakdown?.topRecettes ?? [];

  const paidAllTimeCents = kpis?.revenue?.paidAllTimeCents ?? 0;
  const paidMonthCents = kpis?.revenue?.paidMonthCents ?? paidMonthTotalCents;

  const analysis = useMemo(() => {
    if (hasComptaReport) {
      return {
        summary: `Recettes issues de l’analyse compta : ${formatEur(
          recettesTTC
        )} TTC pour ${formatEur(recettesHT)} HT.`,
        actions: [
          "Comparer les recettes du mois avec les dépenses pour suivre la marge réelle.",
          "Vérifier les mois les plus faibles pour anticiper la trésorerie.",
          "Rattacher les recettes aux chantiers pour une lecture par activité.",
        ],
      };
    }

    if (paidMonth.length === 0) {
      return {
        summary: "Aucun encaissement enregistré ce mois-ci.",
        actions: [
          "Vérifie que les factures payées sont bien passées au statut “paid”.",
          "Active des relances automatiques sur les factures “sent/overdue”.",
        ],
      };
    }

    return {
      summary: `Encaissements du mois: ${formatEurFromCents(
        paidMonthCents
      )} sur ${paidMonth.length} facture(s).`,
      actions: [
        "Standardiser le process: facture → sent → paid (éviter les statuts incohérents).",
        "Suivre le délai moyen de paiement (objectif: réduire les retards).",
        "Ajouter un lien facture → chantier pour analyser le CA par chantier.",
      ],
    };
  }, [hasComptaReport, recettesTTC, recettesHT, paidMonth.length, paidMonthCents]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-bold text-[var(--theme-muted)] hover:text-[var(--theme-text)]"
            >
              <ArrowLeft size={16} /> Retour
            </Link>
          </div>
          <h2 className="text-3xl font-extrabold text-[var(--theme-text)] tracking-tight mt-2">
            Chiffre d&apos;affaires
          </h2>
          <p className="text-[var(--theme-muted)] mt-1">
            Analyse structurée basée sur vos données comptables.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-[var(--theme-card)] border border-[var(--theme-border)] rounded-2xl px-4 py-3 shadow-sm">
          <TrendingUp className="text-emerald-500" size={18} />
          <span className="text-sm font-black text-[var(--theme-text)]">
            {loading
              ? "…"
              : hasComptaReport
              ? formatEur(recettesTTC)
              : formatEurFromCents(paidMonthCents)}
          </span>
          <span className="text-xs font-bold text-[var(--theme-muted)]">
            {hasComptaReport ? "analyse compta" : "mois en cours"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KpiCard
          label={hasComptaReport ? "Recettes HT" : "Encaissements mois"}
          value={
            loading
              ? "…"
              : hasComptaReport
              ? formatEur(recettesHT)
              : formatEurFromCents(paidMonthCents)
          }
          hint={
            hasComptaReport
              ? "Issu de l’analyse compta."
              : "Basé sur les factures au statut paid."
          }
        />
        <KpiCard
          label={hasComptaReport ? "Recettes TTC" : "Encaissements total"}
          value={
            loading
              ? "…"
              : hasComptaReport
              ? formatEur(recettesTTC)
              : formatEurFromCents(paidAllTimeCents)
          }
          hint={
            hasComptaReport
              ? "Synthèse globale de l’analyse."
              : "Historique complet."
          }
        />
        <KpiCard
          label={hasComptaReport ? "Nb. mois analysés" : "Nb. factures payées (mois)"}
          value={loading ? "…" : hasComptaReport ? String(parMois.length) : String(paidMonth.length)}
          hint={
            hasComptaReport
              ? "Périodes détectées dans le fichier."
              : "Nombre de factures marked paid ce mois-ci."
          }
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[var(--theme-card)] rounded-3xl shadow-xl shadow-slate-200/50 border border-[var(--theme-border)] overflow-hidden">
          <div className="p-6 border-b border-[var(--theme-border)]">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">Analyse & optimisation</h3>
            <p className="text-[11px] text-[var(--theme-muted)] font-medium mt-1">
              Recommandations pragmatiques.
            </p>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm font-medium text-[var(--theme-text)]">{analysis.summary}</p>
            <ul className="space-y-2">
              {analysis.actions.map((a) => (
                <li key={a} className="text-sm text-[var(--theme-muted)] flex gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-[var(--theme-bg)]" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-[var(--theme-card)] rounded-3xl shadow-xl shadow-slate-200/50 border border-[var(--theme-border)] overflow-hidden">
          <div className="p-6 border-b border-[var(--theme-border)] flex items-center justify-between">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">
              {hasComptaReport ? "Top recettes" : "Factures payées (mois)"}
            </h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
              {loading
                ? "…"
                : hasComptaReport
                ? `${topRecettes.length} éléments`
                : `${paidMonth.length} éléments`}
            </span>
          </div>

          <div className="divide-y divide-slate-50">
            {hasComptaReport ? (
              topRecettes.length > 0 ? (
                topRecettes.slice(0, 10).map((it) => (
                  <div key={it.label} className="p-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-[var(--theme-text)]">{it.label}</p>
                      <p className="text-xs text-[var(--theme-muted)] font-medium">
                        {it.count} occurrence(s)
                      </p>
                    </div>
                    <span className="text-sm font-black text-[var(--theme-text)]">
                      {formatEur(it.amountHT)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-6 text-sm text-[var(--theme-muted)]">Aucune recette détectée.</div>
              )
            ) : paidMonth.length > 0 ? (
              paidMonth.slice(0, 10).map((it) => (
                <div key={it.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-[var(--theme-text)]">{it.client_name}</p>
                    <p className="text-xs text-[var(--theme-muted)] font-medium">#{it.id.slice(0, 8)}</p>
                  </div>
                  <span className="text-sm font-black text-[var(--theme-text)]">
                    {formatEurFromCents(invoiceAmountCents(it))}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-[var(--theme-muted)]">Aucune facture payée ce mois.</div>
            )}
          </div>

          <div className="p-4 bg-[var(--theme-bg)]/50 text-center">
            <Link
              to="/dashboard"
              className="text-xs font-bold text-[var(--theme-muted)] hover:text-blue-600 uppercase tracking-widest"
            >
              Retour au dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint }: any) {
  return (
    <div className="bg-[var(--theme-card)] p-6 rounded-3xl border border-[var(--theme-border)] shadow-sm">
      <p className="text-[var(--theme-muted)] text-sm font-medium">{label}</p>
      <div className="text-2xl font-black text-[var(--theme-text)] mt-1">{value}</div>
      <p className="text-[11px] text-[var(--theme-muted)] font-medium mt-2">{hint}</p>
    </div>
  );
}
