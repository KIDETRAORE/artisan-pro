import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) process.exit(0);

let bad = false;

const forbidden = [
  /from\s+["']pg["']/,
  /\bnew\s+Pool\s*\(/,
  /\bpool\.query\s*\(/,
  /\bBEGIN\b/,
  /\bCOMMIT\b/,
  /\bROLLBACK\b/,
];

for (const f of files) {
  if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) continue;

  const s = fs.readFileSync(abs, "utf8");

  // Allowlist: allow pg only in scripts/tools (adjust if needed)
  if (f.includes("/scripts/") || f.includes("\\scripts\\")) continue;

  const hit = forbidden.find((re) => re.test(s));
  if (hit) {
    console.error(`❌ Forbidden pg/pool usage in: ${f}`);
    bad = true;
  }
}

if (bad) process.exit(1);