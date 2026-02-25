import * as XLSX from "xlsx";

/**
 * Convertit un .xlsx en texte (TSV) multi-onglets
 * - limite lignes/colonnes pour éviter payload énorme
 */
export function xlsxToText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: "buffer" });
  const parts: string[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];

    const clippedRows = rows.slice(0, 350).map((r) => r.slice(0, 40));
    const tsv = clippedRows
      .map((r) => r.map((c) => String(c ?? "")).join("\t"))
      .join("\n");

    parts.push(`### ${sheetName}\n${tsv}`);
  }

  return parts.join("\n\n");
}