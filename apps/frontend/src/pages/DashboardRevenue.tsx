// apps/frontend/src/pages/DashboardRevenue.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, TrendingUp } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../auth/fetchWithAuth";

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

  const paidAllTimeCents = kpis?.revenue?.paidAllTimeCents ?? 0;
  const paidMonthCents = kpis?.revenue?.paidMonthCents ?? paidMonthTotalCents;

  const analysis = useMemo(() => {
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
  }, [paidMonth.length, paidMonthCents]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <Link
              to="/dashboard"
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft size={16} /> Retour
            </Link>
          </div>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            Chiffre d&apos;affaires
          </h2>
          <p className="text-slate-500 mt-1">
            Analyse structurée basée sur vos factures.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
          <TrendingUp className="text-emerald-500" size={18} />
          <span className="text-sm font-black text-slate-900">
            {loading ? "…" : formatEurFromCents(paidMonthCents)}
          </span>
          <span className="text-xs font-bold text-slate-400">mois en cours</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <KpiCard
          label="Encaissements mois"
          value={loading ? "…" : formatEurFromCents(paidMonthCents)}
          hint="Basé sur les factures au statut paid."
        />
        <KpiCard
          label="Encaissements total"
          value={loading ? "…" : formatEurFromCents(paidAllTimeCents)}
          hint="Historique complet."
        />
        <KpiCard
          label="Nb. factures payées (mois)"
          value={loading ? "…" : String(paidMonth.length)}
          hint="Nombre de factures marked paid ce mois-ci."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-lg font-bold text-slate-900">Analyse & optimisation</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Recommandations pragmatiques (MVP).
            </p>
          </div>

          <div className="p-6 space-y-4">
            <p className="text-sm font-medium text-slate-700">{analysis.summary}</p>
            <ul className="space-y-2">
              {analysis.actions.map((a) => (
                <li key={a} className="text-sm text-slate-600 flex gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50 flex items-center justify-between">
            <h3 className="text-lg font-bold text-slate-900">Factures payées (mois)</h3>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {loading ? "…" : `${paidMonth.length} éléments`}
            </span>
          </div>

          <div className="divide-y divide-slate-50">
            {paidMonth.length > 0 ? (
              paidMonth.slice(0, 10).map((it) => (
                <div key={it.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{it.client_name}</p>
                    <p className="text-xs text-slate-500 font-medium">#{it.id.slice(0, 8)}</p>
                  </div>
                  <span className="text-sm font-black text-slate-900">
                    {formatEurFromCents(invoiceAmountCents(it))}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-slate-500">Aucune facture payée ce mois.</div>
            )}
          </div>
          <div className="p-4 bg-slate-50/50 text-center">
            <Link
              to="/dashboard"
              className="text-xs font-bold text-slate-400 hover:text-blue-600 uppercase tracking-widest"
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
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <div className="text-2xl font-black text-slate-900 mt-1">{value}</div>
      <p className="text-[11px] text-slate-400 font-medium mt-2">{hint}</p>
    </div>
  );
}