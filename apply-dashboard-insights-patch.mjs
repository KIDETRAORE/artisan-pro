#!/usr/bin/env node

/**
 * apply-dashboard-insights-patch.mjs
 *
 * This patch enhances apps/frontend/src/pages/Dashboard.tsx
 * by adding support for `insights` returned by /dashboard API.
 *
 * It only:
 *  - extends DashboardResponse type
 *  - adds insights state
 *  - sets insights after fetch
 *  - renders optional IA hints under KPI cards
 *
 * It does NOT modify API calls, logic, or imports beyond UI additions.
 */

import fs from "fs";
import path from "path";

const root = process.cwd();
const filePath = path.join(root, "apps/frontend/src/pages/Dashboard.tsx");

if (!fs.existsSync(filePath)) {
  console.error("❌ Dashboard.tsx not found");
  process.exit(1);
}

let src = fs.readFileSync(filePath, "utf8");

function replaceOnce(source, search, replace) {
  if (source.includes(search) && !source.includes(replace)) {
    return source.replace(search, replace);
  }
  return source;
}

/**
 * Extend DashboardResponse with insights
 */
src = replaceOnce(
  src,
  "type DashboardResponse = {",
  `type DashboardResponse = {
  insights?: {
    revenue?: string;
    quotes?: string;
    unpaid?: string;
  };`
);

/**
 * Add insights state
 */
src = replaceOnce(
  src,
  "const [kpis, setKpis] = useState<DashboardKpis | null>(null);",
  `const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [insights, setInsights] = useState<any>(null);`
);

/**
 * Store insights after dashboard fetch
 */
src = replaceOnce(
  src,
  "setKpis(dash?.kpis ?? null);",
  `setKpis(dash?.kpis ?? null);
          setInsights((dash as any)?.insights ?? null);`
);

/**
 * Inject UI rendering under cards if not already present
 */
if (!src.includes("IA_INSIGHT_RENDER")) {
  src = src.replace(
    "{value}</h4>",
    `{value}</h4>
      {/* IA_INSIGHT_RENDER */}
      {insights && (
        <div className="mt-2 text-[11px] text-[var(--theme-muted)]">
          ⚡ IA — {title === "Chiffre d'Affaires" ? insights?.revenue :
                   title === "Devis en attente" ? insights?.quotes :
                   title === "Factures impayées" ? insights?.unpaid : null}
        </div>
      )}`
  );
}

fs.writeFileSync(filePath, src);

console.log("✅ Dashboard insights patch applied");
