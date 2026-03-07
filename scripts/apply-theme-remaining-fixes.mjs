// scripts/apply-theme-remaining-fixes.mjs
import fg from "fast-glob";
import fs from "fs";

const FILES = fg.sync([
  "apps/frontend/src/**/*.tsx",
  "apps/frontend/src/**/*.ts",
], {
  ignore: ["**/node_modules/**", "**/*.d.ts"],
});

const replacements = [
  // Remaining guard failures seen in the current repo state
  ["bg-slate-900", "bg-[var(--theme-primary)]"],
  ["bg-slate-800", "bg-[var(--theme-primary)]"],
  ["bg-slate-300", "bg-[var(--theme-bg)]"],
  ["bg-slate-200", "bg-[var(--theme-bg)]"],
  ["border-slate-50", "border-[var(--theme-border)]"],
  ["border-slate-300", "border-[var(--theme-border)]"],
  ["border-slate-400", "border-[var(--theme-border)]"],
  ["text-slate-300", "text-[var(--theme-muted)]"],
];

let changedFiles = 0;

for (const file of FILES) {
  const original = fs.readFileSync(file, "utf8");
  let next = original;

  for (const [from, to] of replacements) {
    next = next.split(from).join(to);
  }

  if (next !== original) {
    fs.writeFileSync(file, next, "utf8");
    changedFiles += 1;
    console.log(`patched: ${file}`);
  }
}

console.log(`\nDone. ${changedFiles} file(s) updated.`);
console.log("Run: npm run guards:all");
