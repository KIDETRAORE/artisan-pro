#!/usr/bin/env node

import fs from "fs";
import path from "path";

const root = process.cwd();

const filePath = path.join(
  root,
  "apps/frontend/src/pages/Compta.tsx"
);

if (!fs.existsSync(filePath)) {
  console.error("Compta.tsx not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("Pilotage IA comptable")) {
  const block = `

      {/* ===== AI COMPTA INSIGHT ===== */}
      <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm space-y-3">
        <h2 className="text-lg font-semibold text-[var(--theme-text)]">
          Pilotage IA comptable
        </h2>

        <div className="rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] px-4 py-3 text-sm text-[var(--theme-text)]">
          Surveillez les écarts entre recettes, dépenses et résultat net pour anticiper les tensions de trésorerie.
        </div>

        <ul className="list-disc pl-5 text-sm text-[var(--theme-muted)] space-y-1">
          <li>Identifier les charges qui progressent trop vite</li>
          <li>Vérifier les périodes où la marge nette baisse</li>
          <li>Prioriser les actions qui améliorent le cash à court terme</li>
        </ul>
      </div>
`;

  const anchor = '<div className="space-y-6';
  if (content.includes(anchor)) {
    content = content.replace(anchor, block + '\n\n      <div className="space-y-6');
  } else {
    console.error("Anchor not found in Compta.tsx");
    process.exit(1);
  }

  fs.writeFileSync(filePath, content, "utf8");
  console.log("AI insight injected into Compta.tsx");
} else {
  console.log("AI insight already present in Compta.tsx");
}
