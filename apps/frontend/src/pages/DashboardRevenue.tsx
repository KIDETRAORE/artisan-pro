// apps/frontend/src/pages/DashboardRevenue.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import {
  listSalesInvoices,
  type SalesInvoice,
} from "../services/salesInvoices.api";
import { useComptaReportStore } from "../store/comptaReport.store";

type DashboardResponse = {
  kpis?: {
    revenue?: { paidAllTimeCents: number; paidMonthCents: number };
    invoices?: {
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
  "id" | "contact_id" | "status" | "created_at" | "total_cents"
>;

type KpiCardProps = {
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

  const monthStartIso = useMemo(() => startOfCurrentMonthIso(), []);

  const paidMonth = useMemo(() => {
    return invoices
      .filter((i) => String(i.status).toLowerCase() === "paid")
      .filter((i) => {
        const createdAt = String(i.created_at ?? "").trim();
        if (!createdAt) return false;

        const parsed = new Date(createdAt);
        if (Number.isNaN(parsed.getTime())) return false;

        return parsed.toISOString() >= monthStartIso;
      })
      .sort((a, b) =>
        String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
      );
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
  const preview = kpis?.invoices?.preview ?? [];

  const previewClientMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of preview) {
      map.set(item.id, item.client);
    }
    return map;
  }, [preview]);

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
  }, [
    hasComptaReport,
    recettesTTC,
    recettesHT,
    paidMonth.length,
    paidMonthCents,
  ]);

  return (
    <div className="mx-auto max-w-7xl space-y-8 animate-in fade-in duration-700">
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
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-[var(--theme-text)]">
            Chiffre d&apos;affaires
          </h2>
          <p className="mt-1 text-[var(--theme-muted)]">
            Analyse structurée basée sur vos données comptables.
          </p>
        </div>

        <div className="hidden items-center gap-2 rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] px-4 py-3 shadow-sm sm:flex">
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
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
          label={
            hasComptaReport
              ? "Nb. mois analysés"
              : "Nb. factures payées (mois)"
          }
          value={
            loading
              ? "…"
              : hasComptaReport
                ? String(parMois.length)
                : String(paidMonth.length)
          }
          hint={
            hasComptaReport
              ? "Périodes détectées dans le fichier."
              : "Nombre de factures au statut paid ce mois-ci."
          }
        />
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="overflow-hidden rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] shadow-xl shadow-slate-200/50">
          <div className="border-b border-[var(--theme-border)] p-6">
            <h3 className="text-lg font-bold text-[var(--theme-text)]">
              Analyse & optimisation
            </h3>
            <p className="mt-1 text-[11px] font-medium text-[var(--theme-muted)]">
              Recommandations pragmatiques.
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
          <div className="flex items-center justify-between border-b border-[var(--theme-border)] p-6">
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

          <div className="divide-y divide-[var(--theme-border)]">
            {hasComptaReport ? (
              topRecettes.length > 0 ? (
                topRecettes.slice(0, 10).map((it) => (
                  <div
                    key={it.label}
                    className="flex items-center justify-between p-4"
                  >
                    <div>
                      <p className="text-sm font-bold text-[var(--theme-text)]">
                        {it.label}
                      </p>
                      <p className="text-xs font-medium text-[var(--theme-muted)]">
                        {it.count} occurrence(s)
                      </p>
                    </div>
                    <span className="text-sm font-black text-[var(--theme-text)]">
                      {formatEur(it.amountHT)}
                    </span>
                  </div>
                ))
              ) : (
                <div className="p-6 text-sm text-[var(--theme-muted)]">
                  Aucune recette détectée.
                </div>
              )
            ) : paidMonth.length > 0 ? (
              paidMonth.slice(0, 10).map((it) => (
                <div
                  key={it.id}
                  className="flex items-center justify-between p-4"
                >
                  <div>
                    <p className="text-sm font-bold text-[var(--theme-text)]">
                      {getInvoiceDisplayClient(it, previewClientMap)}
                    </p>
                    <p className="text-xs font-medium text-[var(--theme-muted)]">
                      #{it.id.slice(0, 8)}
                    </p>
                  </div>
                  <span className="text-sm font-black text-[var(--theme-text)]">
                    {formatEurFromCents(invoiceAmountCents(it))}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-[var(--theme-muted)]">
                Aucune facture payée ce mois.
              </div>
            )}
          </div>

          <div className="bg-[var(--theme-bg)]/50 p-4 text-center">
            <Link
              to="/dashboard"
              className="text-xs font-bold uppercase tracking-widest text-[var(--theme-muted)] hover:text-[var(--theme-primary)]"
            >
              Retour au dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ label, value, hint }: KpiCardProps) {
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