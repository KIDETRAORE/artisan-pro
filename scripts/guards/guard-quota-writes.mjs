import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) process.exit(0);

// Interdit: update ai_quota.used hors RPC (backend code)
// Autorisé: quota.service.ts peut insérer ensure row, mais pas incrémenter used via update direct.
const forbidden = [
  // supabase.from("ai_quota").update({ used: ... })
  /from\(\s*["'`]ai_quota["'`]\s*\)\s*[\s\S]{0,120}?update\(\s*{[\s\S]*\bused\b\s*:/m,
  // update ai_quota set used = used + ...
  /\bupdate\s+ai_quota\s+set\s+[\s\S]*\bused\b\s*=/im,
];

let bad = false;

for (const f of files) {
  if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) continue;

  const s = fs.readFileSync(abs, "utf8");

  // On tolère les inserts/ensure row, mais pas les updates used.
  if (forbidden.some((re) => re.test(s))) {
    console.error(`❌ Forbidden ai_quota write (used) found in: ${f}`);
    bad = true;
  }
}

if (bad) {
  console.error(
    "\n✅ Fix: quota consumption must happen only via RPC consume_ai_quota(uid, amt).\n"
  );
  process.exit(1);
}