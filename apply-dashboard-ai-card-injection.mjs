#!/usr/bin/env node

/**
 * apply-dashboard-ai-card-injection.mjs
 *
 * Injects the AIInsightCard component into Dashboard.tsx.
 * Safe patch:
 * - adds import
 * - renders AIInsightCard under KPI cards if insights exist
 * - does not modify API or logic
 */

import fs from "fs";
import path from "path";

const root = process.cwd();
const file = path.join(root, "apps/frontend/src/pages/Dashboard.tsx");

if (!fs.existsSync(file)) {
  console.error("❌ Dashboard.tsx not found");
  process.exit(1);
}

let src = fs.readFileSync(file, "utf8");

function injectImport(code) {
  if (!code.includes("AIInsightCard")) {
    return code.replace(
      'import { Link } from "react-router-dom";',
      'import { Link } from "react-router-dom";\nimport AIInsightCard from "../components/ai/AIInsightCard";'
    );
  }
  return code;
}

function injectUsage(code) {
  if (!code.includes("AIInsightCard")) return code;

  if (!code.includes("AI_INSIGHT_CARD_USAGE")) {
    return code.replace(
      "{value}</h4>",
      `{value}</h4>

      {/* AI_INSIGHT_CARD_USAGE */}
      <AIInsightCard
        title={title}
        insight={
          title === "Chiffre d'affaires"
            ? insights?.revenue
            : title === "Devis en attente"
            ? insights?.quotes
            : title === "Factures impayées"
            ? insights?.unpaid
            : null
        }
      />`
    );
  }

  return code;
}

src = injectImport(src);
src = injectUsage(src);

fs.writeFileSync(file, src);

console.log("✅ AIInsightCard injected into Dashboard");
