import React from "react";

type Props = {
  revenueCents: number;
  expensesCents: number;
  profitCents: number;
};

function getInsight(revenueCents: number, expensesCents: number, profitCents: number) {
  if (revenueCents <= 0) {
    return {
      title: "Analyse IA",
      bullets: [
        "Aucun chiffre d’affaires n’est encore rattaché à ce chantier.",
        "Finalise et rattache les factures du chantier pour mesurer la rentabilité réelle.",
      ],
      recommendation:
        "Conseil IA : commence par rattacher toutes les factures émises à ce chantier.",
    };
  }

  const rate = Math.round((profitCents / revenueCents) * 100);

  if (rate < 10) {
    return {
      title: "Analyse IA",
      bullets: [
        "Ce chantier est peu rentable ou déficitaire.",
        "Les dépenses semblent trop élevées par rapport au facturé.",
        "Le prix initial est probablement sous-estimé ou le temps passé trop important.",
      ],
      recommendation:
        "Conseil IA : augmenter le prix devis de 10% à 15% pour ce type de chantier et mieux contrôler matériaux / temps passé.",
    };
  }

  if (rate < 25) {
    return {
      title: "Analyse IA",
      bullets: [
        "La rentabilité est correcte mais reste fragile.",
        "Le chantier laisse peu de marge en cas d’imprévu.",
        "Une meilleure maîtrise des coûts améliorerait nettement le résultat.",
      ],
      recommendation:
        "Conseil IA : ajouter une marge de sécurité sur les prochains devis et suivre les dépenses chantier poste par poste.",
    };
  }

  return {
    title: "Analyse IA",
    bullets: [
      "Ce chantier présente une bonne rentabilité.",
      "Le niveau de marge est cohérent avec une activité saine.",
      "Tu peux utiliser ce chantier comme référence de prix pour les futurs devis similaires.",
    ],
    recommendation:
      "Conseil IA : standardiser ce type de devis comme modèle rentable.",
  };
}

export default function ProjectInsightsCard({
  revenueCents,
  expensesCents,
  profitCents,
}: Props) {
  const insight = getInsight(revenueCents, expensesCents, profitCents);

  return (
    <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
      <h3 className="text-lg font-semibold text-[var(--theme-text)]">
        {insight.title}
      </h3>

      <ul className="mt-4 space-y-2 text-sm text-[var(--theme-text)]">
        {insight.bullets.map((item) => (
          <li key={item} className="flex gap-2">
            <span
              className="mt-[6px] h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--theme-muted)" }}
            />
            <span>{item}</span>
          </li>
        ))}
      </ul>

      <div className="mt-4 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-4 text-sm text-[var(--theme-text)]">
        <span className="font-semibold">Conseil IA : </span>
        {insight.recommendation.replace(/^Conseil IA :\s*/i, "")}
      </div>
    </div>
  );
}