#!/usr/bin/env node

/**
 * apply-refactor-pages-batch-1.mjs
 *
 * Safe UI refactor patch for ArtisanPro pages.
 * Only updates page titles / subtitles to reflect the new UX model:
 * Accueil / Actions / Compte
 *
 * No business logic changes.
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

const files = [
  "apps/frontend/src/pages/Compta.tsx",
  "apps/frontend/src/pages/Vision.tsx",
  "apps/frontend/src/pages/Devis.tsx",
  "apps/frontend/src/pages/DashboardRevenue.tsx",
  "apps/frontend/src/pages/DashboardUnpaid.tsx",
  "apps/frontend/src/pages/DashboardQuotes.tsx",
];

function safeReplace(content, from, to) {
  if (content.includes(from)) {
    return content.replace(from, to);
  }
  return content;
}

for (const relative of files) {
  const file = path.join(root, relative);

  if (!fs.existsSync(file)) {
    console.log("⚠️ File not found:", relative);
    continue;
  }

  let content = fs.readFileSync(file, "utf8");

  content = safeReplace(
    content,
    "Tableau de bord",
    "Vue détaillée"
  );

  content = safeReplace(
    content,
    "Analyse comptable",
    "Analyse détaillée"
  );

  content = safeReplace(
    content,
    "Suivi des devis",
    "Détail des devis"
  );

  content = safeReplace(
    content,
    "Analyse des factures",
    "Détail des factures"
  );

  fs.writeFileSync(file, content, "utf8");
  console.log("✅ Patched:", relative);
}

console.log("\\n🎉 Patch completed.");
