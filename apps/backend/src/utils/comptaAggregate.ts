import type { SheetTable } from "./xlsxToJson";

function toNumber(v: any): number {
  if (v == null) return 0;
  const n = Number(String(v).replace(",", ".").replace(/\s/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function toMonth(v: any): string | null {
  // accepte "2026-01-15" / "15/01/2026" / etc
  const s = String(v ?? "").trim();
  if (!s) return null;

  // simple heuristique
  const iso = s.match(/^(\d{4})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}`;

  const fr = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (fr) return `${fr[3]}-${fr[2]}`;

  return null;
}

function idxOf(cols: string[], candidates: string[]): number {
  const lower = cols.map((c) => c.toLowerCase());
  for (const cand of candidates) {
    const i = lower.indexOf(cand.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

export function computeComptaAggregates(allSheets: Record<string, SheetTable>) {
  let recettesHT = 0, recettesTTC = 0, depensesHT = 0, depensesTTC = 0;
  let tvaCollectee = 0, tvaDeductible = 0;

  const byMonth = new Map<string, { recettesHT: number; depensesHT: number; tvaC: number; tvaD: number }>();

  const anomalies: { severity: "info" | "warn" | "critical"; message: string; sheet?: string; rowIndex?: number }[] = [];

  // Heuristique: on considère feuilles contenant "vente" = recettes, "achat"/"charge" = dépenses
  for (const [sheetName, table] of Object.entries(allSheets)) {
    const cols = table.columns;

    const isVente = sheetName.toLowerCase().includes("vente");
    const isAchat = sheetName.toLowerCase().includes("achat") || sheetName.toLowerCase().includes("charge");

    // colonnes candidates
    const dateIdx = idxOf(cols, ["date", "created_at", "jour"]);
    const htIdx = idxOf(cols, ["ht", "total_ht", "montant_ht", "amount_ht"]);
    const ttcIdx = idxOf(cols, ["ttc", "total_ttc", "montant_ttc", "amount_ttc"]);
    const tvaIdx = idxOf(cols, ["tva", "vat", "montant_tva"]);

    for (let r = 0; r < table.rows.length; r++) {
      const row = table.rows[r];

      const ht = htIdx >= 0 ? toNumber(row[htIdx]) : 0;
      const ttc = ttcIdx >= 0 ? toNumber(row[ttcIdx]) : 0;
      const tva = tvaIdx >= 0 ? toNumber(row[tvaIdx]) : Math.max(0, ttc - ht);

      const month = dateIdx >= 0 ? toMonth(row[dateIdx]) : null;

      if (isVente) {
        recettesHT += ht;
        recettesTTC += ttc;
        tvaCollectee += tva;
      } else if (isAchat) {
        depensesHT += ht;
        depensesTTC += ttc;
        tvaDeductible += tva;
      }

      if (month) {
        const obj = byMonth.get(month) ?? { recettesHT: 0, depensesHT: 0, tvaC: 0, tvaD: 0 };
        if (isVente) { obj.recettesHT += ht; obj.tvaC += tva; }
        if (isAchat) { obj.depensesHT += ht; obj.tvaD += tva; }
        byMonth.set(month, obj);
      }

      // anomalies basiques
      if (ht < 0 || ttc < 0) anomalies.push({ severity: "warn", message: "Montant négatif détecté", sheet: sheetName, rowIndex: r + 2 });
      if (ttc && ht && ttc < ht) anomalies.push({ severity: "warn", message: "TTC < HT (incohérent)", sheet: sheetName, rowIndex: r + 2 });
    }
  }

  const resultatNet = recettesHT - depensesHT;

  const parMois = Array.from(byMonth.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, v]) => ({
      month,
      recettesHT: round2(v.recettesHT),
      depensesHT: round2(v.depensesHT),
      resultatNet: round2(v.recettesHT - v.depensesHT),
      tvaCollectee: round2(v.tvaC),
      tvaDeductible: round2(v.tvaD),
    }));

  return {
    totals: {
      recettesHT: round2(recettesHT),
      recettesTTC: round2(recettesTTC),
      depensesHT: round2(depensesHT),
      depensesTTC: round2(depensesTTC),
      resultatNet: round2(resultatNet),
    },
    tva: {
      collectee: round2(tvaCollectee),
      deductible: round2(tvaDeductible),
      aPayer: round2(tvaCollectee - tvaDeductible),
    },
    breakdown: { parMois },
    anomalies,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}