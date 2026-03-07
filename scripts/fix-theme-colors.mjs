import fs from "fs";
import path from "path";

const ROOT = "apps/frontend/src";

const replacements = [
  ["bg-white", "bg-[var(--theme-card)]"],
  ["text-slate-900", "text-[var(--theme-text)]"],
  ["text-slate-800", "text-[var(--theme-text)]"],
  ["text-slate-700", "text-[var(--theme-text)]"],
  ["text-slate-600", "text-[var(--theme-muted)]"],
  ["text-slate-500", "text-[var(--theme-muted)]"],
  ["text-slate-400", "text-[var(--theme-muted)]"],
  ["border-slate-200", "border-[var(--theme-border)]"],
  ["border-slate-100", "border-[var(--theme-border)]"],
  ["bg-slate-50", "bg-[var(--theme-bg)]"],
  ["bg-slate-100", "bg-[var(--theme-bg)]"],
];

function scan(dir) {
  const entries = fs.readdirSync(dir);

  for (const entry of entries) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);

    if (stat.isDirectory()) {
      scan(full);
      continue;
    }

    if (!full.endsWith(".tsx") && !full.endsWith(".ts")) continue;

    let content = fs.readFileSync(full, "utf8");

    let original = content;

    for (const [from, to] of replacements) {
      content = content.split(from).join(to);
    }

    if (content !== original) {
      fs.writeFileSync(full, content);
      console.log("patched:", full);
    }
  }
}

console.log("Scanning UI files...");
scan(ROOT);
console.log("Theme patch complete.");