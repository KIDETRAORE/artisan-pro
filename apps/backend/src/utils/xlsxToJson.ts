import * as XLSX from "xlsx";

export type SheetTable = {
  columns: string[];
  rows: any[][];
};

export function xlsxToJson(buffer: Buffer): { sheetNames: string[]; tables: Record<string, SheetTable>; rowsTotal: number } {
  const wb = XLSX.read(buffer, { type: "buffer" });

  const tables: Record<string, SheetTable> = {};
  let rowsTotal = 0;

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false }) as any[][];

    if (!grid.length) {
      tables[sheetName] = { columns: [], rows: [] };
      continue;
    }

    const headerRow = grid[0].map((c) => String(c ?? "").trim());
    const columns = headerRow.map((c, idx) => c || `col_${idx + 1}`);

    const rows = grid.slice(1).map((r) => {
      const row = Array.from({ length: columns.length }, (_, i) => r?.[i] ?? null);
      return row;
    });

    rowsTotal += rows.length;

    tables[sheetName] = { columns, rows };
  }

  return { sheetNames: wb.SheetNames, tables, rowsTotal };
}