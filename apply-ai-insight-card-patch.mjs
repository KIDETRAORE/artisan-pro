#!/usr/bin/env node

/**
 * apply-ai-insight-card-patch.mjs
 *
 * Creates a reusable AIInsightCard component used to display
 * contextual IA recommendations across the app (Dashboard, Compta, etc.).
 *
 * Safe patch:
 * - only creates a new component file
 * - does not modify existing files
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

const targetDir = path.join(root, "apps/frontend/src/components/ai");
const targetFile = path.join(targetDir, "AIInsightCard.tsx");

if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

if (fs.existsSync(targetFile)) {
  console.log("⚠️ AIInsightCard already exists — skipping");
  process.exit(0);
}

const content = `
import React from "react";

type Props = {
  title?: string;
  insight?: string | null;
};

export default function AIInsightCard({ title, insight }: Props) {
  if (!insight) return null;

  return (
    <div className="mt-3 rounded-xl border border-[var(--theme-border)] bg-[var(--theme-bg)] p-3">
      <div className="text-[10px] font-black uppercase tracking-widest text-[var(--theme-muted)]">
        ⚡ IA Insight
      </div>

      {title && (
        <div className="mt-1 text-xs font-bold text-[var(--theme-text)]">
          {title}
        </div>
      )}

      <div className="mt-1 text-xs text-[var(--theme-muted)] leading-relaxed">
        {insight}
      </div>
    </div>
  );
}
`;

fs.writeFileSync(targetFile, content.trim() + "\n");

console.log("✅ AIInsightCard component created");
