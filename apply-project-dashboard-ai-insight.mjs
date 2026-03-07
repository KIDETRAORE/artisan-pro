#!/usr/bin/env node

import fs from "fs";
import path from "path";

const root = process.cwd();

const filePath = path.join(
  root,
  "apps/frontend/src/pages/ProjectDashboard.tsx"
);

if (!fs.existsSync(filePath)) {
  console.error("ProjectDashboard.tsx not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("Optimisation IA chantier")) {
  const block = `

      {/* ===== AI PROJECT INSIGHT ===== */}
      <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-[var(--theme-text)]">
          Optimisation IA chantier
        </h2>

        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)]">
          Surveillez la marge, les dépenses dominantes et le budget restant pour éviter une dérive du chantier.
        </div>

        <ul className="list-disc pl-5 text-sm text-[var(--theme-muted)] space-y-1">
          <li>Prioriser les postes de dépense les plus élevés</li>
          <li>Relancer rapidement les factures liées au chantier</li>
          <li>Ajuster les futurs devis si la rentabilité devient trop faible</li>
        </ul>
      </div>
`;

  content = content.replace(
    '      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">',
    block + '\n      <div className="rounded-2xl border bg-white p-4 shadow-sm space-y-4">'
  );

  fs.writeFileSync(filePath, content, "utf8");
  console.log("AI insight injected into ProjectDashboard.tsx");
} else {
  console.log("AI insight already present in ProjectDashboard.tsx");
}
