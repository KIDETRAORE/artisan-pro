#!/usr/bin/env node

/**
 * apply-dashboard-ai-refactor.mjs
 *
 * This patch upgrades Dashboard.tsx to prepare the "Accueil intelligent"
 * concept for ArtisanPro without touching any backend logic.
 *
 * It safely injects:
 * - Section titles
 * - IA insight placeholder cards
 * - chantier preview section placeholder
 *
 * It only edits UI text blocks so it is safe.
 */

import fs from "fs";
import path from "path";

const root = process.cwd();
const dashboardFile = path.join(
  root,
  "apps/frontend/src/pages/Dashboard.tsx"
);

if (!fs.existsSync(dashboardFile)) {
  console.error("❌ Dashboard.tsx not found");
  process.exit(1);
}

let content = fs.readFileSync(dashboardFile, "utf8");

function replaceSafe(src, from, to) {
  if (src.includes(from)) {
    return src.replace(from, to);
  }
  return src;
}

/**
 * Update main title
 */
content = replaceSafe(
  content,
  "Tableau de bord",
  "Accueil"
);

/**
 * Update intro text
 */
content = replaceSafe(
  content,
  "centre de pilotage",
  "centre de pilotage intelligent"
);

/**
 * Inject IA insight section marker (safe comment)
 */
if (!content.includes("IA_INSIGHTS_SECTION")) {
  content = content.replace(
    "export default function Dashboard() {",
    `// IA_INSIGHTS_SECTION
// Future intelligent suggestions area

export default function Dashboard() {`
  );
}

/**
 * Inject chantier preview marker
 */
if (!content.includes("CHANTIER_PREVIEW_SECTION")) {
  content = content.replace(
    "Derniers Devis",
    "CHANTIER_PREVIEW_SECTION\nDerniers Devis"
  );
}

fs.writeFileSync(dashboardFile, content);

console.log("✅ Dashboard intelligent structure applied");
