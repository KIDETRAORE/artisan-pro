// apps/frontend/src/pages/DashboardUnpaid.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, MoreHorizontal } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../auth/fetchWithAuth";

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

type InvoiceRow = {
  id: string;
  client_name: string;
  status: string;
  due_date: string;
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
  if (typeof inv.total_amount_cents === "number") return inv.total_amount_cents;
  if (typeof inv.total_amount === "number") return Math.round(inv.total_amount * 100);
  return 0;
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

  const unpaidStatuses = useMemo(() => new Set(["sent", "overdue"]), []);
  const unpaid = useMemo(() => {
    return invoices
      .filter((i) => unpaidStatuses.has(String(i.status).toLowerCase()))
      .sort((a, b) => {
        const ad = new Date(a.due_date).getTime();
        const bd = new Date(b.due_date).getTime();
        if (ad !== bd) return ad - bd;
        return invoiceAmountCents(b) - invoiceAmountCents(a);
      });
  }, [invoices, unpaidStatuses]);

  const overdue = useMemo(() => {
    const now = Date.now();
    return unpaid.filter((i) => new Date(i.due_date).getTime() < now);
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

  const recommendations = useMemo(() => {
    const actions: string[] = [];

    if (overdueCount > 0) {
      actions.push("Relancer en priorité les factures en retard (mail + SMS si possible).");
      actions.push("Proposer un paiement en ligne (lien de règlement) pour réduire le délai de paiement.");
    }

    if (unpaidCount > 5) {
      actions.push("Mettre en place une relance automatique J+1 / J+7 / J+15 sur les factures sent/overdue.");
    }

    actions.push("Déclencher la sync externe uniquement quand la facture est finalisée (status: sent) et avec des lignes stables.");
    actions.push("Suivre le DSO (délai moyen de paiement) et fixer un objectif de réduction.");

    return actions;
  }, [overdueCount, unpaidCount]);

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-700">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Link
            to="/dashboard"
            className="inline-flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Retour
          </Link>
          <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-2">
            Factures impayées
          </h2>
          <p className="text-slate-500 mt-1">
            Pilotage trésorerie: impayés, retards et actions recommandées.
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
          <AlertTriangle className="text-red-500" size={18} />
          <span className="text-sm font-black text-slate-900">
            {loading ? "…" : formatEurFromCents(unpaidTotalCents)}
          </span>
          <span className="text-xs font-bold text-slate-400">à encaisser</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <Kpi label="Impayés" value={loading ? "…" : String(unpaidCount)} hint="factures sent/overdue" />
        <Kpi label="Montant impayé" value={loading ? "…" : formatEurFromCents(unpaidTotalCents)} hint="total à encaisser" />
        <Kpi label="En retard" value={loading ? "…" : String(overdueCount)} hint="échéance dépassée" />
        <Kpi label="Montant en retard" value={loading ? "…" : formatEurFromCents(overdueTotalCents)} hint="priorité relance" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-lg font-bold text-slate-900">À relancer en priorité</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Top impayés (retard, puis montant).
            </p>
          </div>

          <div className="divide-y divide-slate-50">
            {preview.length > 0 ? (
              preview.map((it) => (
                <div key={it.id} className="p-4 flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold text-slate-900">{it.client}</p>
                    <p className="text-xs text-slate-500 font-medium">
                      Échéance: {formatDateFr(it.dueDate)}
                      {it.daysLate > 0 ? ` • ${it.daysLate}j de retard` : ""}
                    </p>
                  </div>
                  <span className="text-sm font-black text-slate-900">
                    {formatEurFromCents(it.totalAmountCents)}
                  </span>
                </div>
              ))
            ) : (
              <div className="p-6 text-sm text-slate-500">Aucune relance prioritaire.</div>
            )}
          </div>
        </div>

        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-lg font-bold text-slate-900">Analyse & plan d’action</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Suggestions pour améliorer l’encaissement.
            </p>
          </div>
          <div className="p-6">
            <ul className="space-y-2">
              {recommendations.map((a) => (
                <li key={a} className="text-sm text-slate-600 flex gap-3">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-slate-300" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
        <div className="p-6 border-b border-slate-50 flex items-center justify-between">
          <h3 className="text-lg font-bold text-slate-900">Toutes les factures impayées</h3>

          <div className="relative flex items-center gap-3">
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
              {loading ? "…" : `${unpaid.length} éléments`}
            </span>

            <button
              type="button"
              onClick={() => setMenuOpen((prev) => !prev)}
              className="inline-flex items-center justify-center rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              aria-label="Ouvrir le menu"
            >
              <MoreHorizontal size={16} />
            </button>

            {menuOpen ? (
              <div className="absolute right-0 top-12 z-20 w-48 rounded-2xl border border-slate-200 bg-white p-2 shadow-xl">
                <Link
                  to="/invoices"
                  onClick={() => setMenuOpen(false)}
                  className="block rounded-xl px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Créer une facture
                </Link>
              </div>
            ) : null}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left">
            <thead className="bg-slate-50/60">
              <tr className="text-xs font-black uppercase tracking-widest text-slate-400">
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Échéance</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3 text-right">Montant</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {unpaid.length > 0 ? (
                unpaid.map((it) => {
                  const status = String(it.status).toLowerCase();
                  const overdueFlag = new Date(it.due_date).getTime() < Date.now();

                  return (
                    <tr key={it.id} className="text-sm">
                      <td className="px-4 py-3 font-bold text-slate-900">{it.client_name}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatDateFr(it.due_date)}
                        {overdueFlag ? " • en retard" : ""}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${
                            status === "overdue"
                              ? "bg-red-100 text-red-700"
                              : "bg-amber-100 text-amber-700"
                          }`}
                        >
                          {status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right font-black text-slate-900">
                        {formatEurFromCents(invoiceAmountCents(it))}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-500" colSpan={4}>
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

function Kpi({ label, value, hint }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
      <p className="text-slate-500 text-sm font-medium">{label}</p>
      <div className="text-2xl font-black text-slate-900 mt-1">{value}</div>
      <p className="text-[11px] text-slate-400 font-medium mt-2">{hint}</p>
    </div>
  );
}