// scripts/guards/guard-no-hardcoded-ui-colors.mjs

import fg from "fast-glob";
import fs from "fs";

const FILES = fg.sync(
  [
    "apps/frontend/src/**/*.tsx",
    "apps/frontend/src/**/*.ts",
  ],
  {
    ignore: ["**/node_modules/**"],
  }
);

const forbiddenPatterns = [
  /\bbg-white\b/g,
  /\bbg-slate-(50|100|200|300|400|500|600|700|800|900)\b/g,
  /\btext-slate-(50|100|200|300|400|500|600|700|800|900)\b/g,
  /\bborder-slate-(50|100|200|300|400|500|600|700|800|900)\b/g,
  /\bbg-gray-(50|100|200|300|400|500|600|700|800|900)\b/g,
  /\btext-gray-(50|100|200|300|400|500|600|700|800|900)\b/g,
  /\bborder-gray-(50|100|200|300|400|500|600|700|800|900)\b/g,
];

const allowedThemeTokens = [
  "bg-[var(--theme-bg)]",
  "bg-[var(--theme-card)]",
  "text-[var(--theme-text)]",
  "text-[var(--theme-muted)]",
  "border-[var(--theme-border)]",
  "bg-[var(--theme-primary)]",
  "text-[var(--theme-primary-contrast)]",
];

let hasError = false;

for (const file of FILES) {
  const content = fs.readFileSync(file, "utf8");

  for (const pattern of forbiddenPatterns) {
    const matches = [...content.matchAll(pattern)];

    for (const match of matches) {
      console.error(
        `❌ Hardcoded UI color "${match[0]}" found in ${file}`
      );
      hasError = true;
    }
  }
}

if (hasError) {
  console.error("\n🚨 Forbidden hardcoded UI colors detected.");
  console.error("Use theme tokens instead:");

  for (const token of allowedThemeTokens) {
    console.error(`   - ${token}`);
  }

  process.exit(1);
}

console.log("✅ UI theme guard passed.");