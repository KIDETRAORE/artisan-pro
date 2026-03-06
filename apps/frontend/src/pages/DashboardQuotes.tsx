// apps/frontend/src/pages/DashboardQuotes.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock } from "lucide-react";
import { Link } from "react-router-dom";
import { fetchWithAuth } from "../auth/fetchWithAuth";
import { useComptaReportStore } from "../store/comptaReport.store";

type DashboardResponse = {
  kpis?: {
    quotes?: { pendingCount: number };
    revenue?: { paidMonthCents: number };
  };
};

function formatEur(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

export default function DashboardQuotes() {
  const report = useComptaReportStore((s) => s.report);

  const [loading, setLoading] = useState(false);
  const [pendingCount, setPendingCount] = useState<number>(0);
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
        if (!cancelled) {
          setPendingCount(dash?.kpis?.quotes?.pendingCount ?? 0);
        }
      } catch {
        if (!cancelled) setPendingCount(0);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const hasComptaReport = !!report;
  const depensesHT = report?.totals?.depensesHT ?? 0;
  const depensesTTC = report?.totals?.depensesTTC ?? 0;
  const topDepenses = report?.breakdown?.topDepenses ?? [];
  const anomalies = report?.anomalies ?? [];

  const analysis = useMemo(() => {
    if (hasComptaReport) {
      return {
        summary:
          anomalies.length > 0
            ? `${anomalies.length} anomalie(s) détectée(s). Dépenses analysées : ${formatEur(
                depensesTTC
              )} TTC pour ${formatEur(depensesHT)} HT.`
            : `Dépenses analysées : ${formatEur(depensesTTC)} TTC pour ${formatEur(
                depensesHT
              )} HT.`,
        actions: [
          "Contrôler les plus gros postes de dépenses pour identifier les dérives.",
          "Comparer les charges récurrentes avec les mois précédents.",
          "Prioriser les anomalies critiques détectées par l’analyse IA.",
          "Rattacher les dépenses aux chantiers pour un pilotage BTP plus fin.",
        ],
      };
    }

    const actions = [
      "Définir le statut devis (draft/sent/accepted/refused) comme source de vérité côté backend.",
      "Relier devis → facture (invoice_id) pour mesurer le taux de conversion.",
      "Relance devis envoyés à J+2 / J+7 (gain direct sur le CA).",
      "Ajouter un champ chantier/projet sur le devis pour un pilotage BTP cohérent.",
    ];

    return {
      summary:
        pendingCount > 0
          ? `${pendingCount} devis en attente (valeur exacte non disponible tant que le backend devis n’est pas branché).`
          : "Aucun devis en attente (ou backend devis non branché).",
      actions,
    };
  }, [hasComptaReport, anomalies.length, depensesTTC, depensesHT, pendingCount]);

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
            {hasComptaReport ? "Dépenses" : "Devis en attente"}
          </h2>
          <p className="text-slate-500 mt-1">
            {hasComptaReport
              ? "Analyse structurée des dépenses issues de la compta IA."
              : "Analyse structurée + prochaines améliorations (devis backend à finaliser)."}
          </p>
        </div>

        <div className="hidden sm:flex items-center gap-2 bg-white border border-slate-100 rounded-2xl px-4 py-3 shadow-sm">
          <Clock className="text-amber-500" size={18} />
          <span className="text-sm font-black text-slate-900">
            {loading
              ? "…"
              : hasComptaReport
              ? formatEur(depensesTTC)
              : String(pendingCount)}
          </span>
          <span className="text-xs font-bold text-slate-400">
            {hasComptaReport ? "dépenses" : "en attente"}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden">
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-lg font-bold text-slate-900">Analyse</h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              Ce que l’écran peut faire dès maintenant.
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
          <div className="p-6 border-b border-slate-50">
            <h3 className="text-lg font-bold text-slate-900">
              {hasComptaReport ? "Top dépenses" : "Actions rapides"}
            </h3>
            <p className="text-[11px] text-slate-500 font-medium mt-1">
              {hasComptaReport
                ? "Postes détectés par l’analyse comptable."
                : "Aller vers la source de vérité."}
            </p>
          </div>

          <div className="p-6 space-y-3">
            {hasComptaReport ? (
              topDepenses.length > 0 ? (
                topDepenses.slice(0, 10).map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">{item.label}</p>
                      <p className="text-xs text-slate-500 font-medium">
                        {item.count} occurrence(s)
                      </p>
                    </div>
                    <span className="text-sm font-black text-slate-900">
                      {formatEur(item.amountHT)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="text-xs text-slate-400 font-medium">
                  Aucune dépense détaillée détectée.
                </p>
              )
            ) : (
              <>
                <Link
                  to="/devis"
                  className="block bg-slate-900 text-white px-4 py-3 rounded-2xl font-bold text-sm hover:bg-blue-600 transition-colors"
                >
                  Ouvrir le module Devis
                </Link>
                <Link
                  to="/dashboard"
                  className="block bg-white border border-slate-200 text-slate-900 px-4 py-3 rounded-2xl font-bold text-sm hover:border-blue-200 hover:bg-blue-50/30 transition-colors"
                >
                  Revenir au dashboard
                </Link>
                <p className="text-xs text-slate-400 font-medium">
                  Note: pour afficher une vraie liste “devis en attente”, il faudra brancher le backend devis (table + statuts) comme on l’a fait pour les factures.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}