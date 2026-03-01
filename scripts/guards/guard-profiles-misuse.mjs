// scripts/guards/guard-profiles-misuse.mjs
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) process.exit(0);

/**
 * ✅ ONLY ALLOWED profiles columns (DB-aligned)
 * profiles may contain identity/contact fields, but NEVER business cache fields.
 */
const ALLOWED_PROFILE_COLS = new Set([
  "id",
  "full_name",
  "company_name",
  "email",
  "role",
  "created_at",
]);

/**
 * ❌ Forbidden “business cache” tokens anywhere
 * (explicitly disallow these even outside select strings)
 *
 * NOTE: profiles.email is allowed (DB-aligned), but MUST NEVER be logged (PII rule).
 */
const forbiddenTokens = [
  /\bprofiles\.plan\b/m,
  /\bsubscription_status\b/m,
  /\bmonthly_quota_\w+\b/m,
  /\bquota_reset_at\b/m,
];

/**
 * Find + parse .from("profiles").select("...")
 * We allow only a strict allowlist of columns (no "*" / no aliases).
 */
const fromProfilesSelectRegex =
  /from\(\s*["'`]profiles["'`]\s*\)[\s\S]{0,400}?select\(\s*["'`]([^"'`]*)["'`]\s*\)/gm;

/**
 * Find .from("profiles").update({...}) — forbidden always
 */
const fromProfilesUpdateRegex =
  /from\(\s*["'`]profiles["'`]\s*\)[\s\S]{0,400}?update\(\s*{/m;

/**
 * Helpers
 */
function getLineNumber(text, index) {
  // count '\n' before index (1-based)
  let line = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) line++;
  return line;
}

function getLineAt(text, lineNo) {
  const lines = text.split("\n");
  return lines[lineNo - 1] ?? "";
}

function normalizeCols(selectArg) {
  // remove spaces, split by comma, drop empty
  return selectArg
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

function isSelectAllowed(cols) {
  // allow "*" ? -> NO (would expose future columns)
  if (cols.includes("*")) return false;

  // allow only known columns, no nested selects
  // (we also block things like "role as r" by rejecting spaces)
  for (const c of cols) {
    if (!c) return false;
    if (/\s/.test(c)) return false; // blocks "role as x", etc.
    if (!ALLOWED_PROFILE_COLS.has(c)) return false;
  }
  return true;
}

let bad = false;

for (const f of files) {
  if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;

  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) continue;

  const s = fs.readFileSync(abs, "utf8");

  // 1) Block forbidden tokens anywhere
  const tokenHit = forbiddenTokens.find((re) => re.test(s));
  if (tokenHit) {
    const idx = s.search(tokenHit);
    const lineNo = getLineNumber(s, idx);
    console.error(`❌ Forbidden profiles usage found in: ${f}:${lineNo}`);
    console.error(`   ${getLineAt(s, lineNo)}`);
    bad = true;
  }

  // 2) Block any update on profiles
  if (fromProfilesUpdateRegex.test(s)) {
    const idx = s.search(fromProfilesUpdateRegex);
    const lineNo = getLineNumber(s, idx);
    console.error(`❌ Forbidden profiles update found in: ${f}:${lineNo}`);
    console.error(`   ${getLineAt(s, lineNo)}`);
    bad = true;
  }

  // 3) Allow only safe selects on profiles
  // Iterate over all select calls after from("profiles")
  fromProfilesSelectRegex.lastIndex = 0;
  let m;
  while ((m = fromProfilesSelectRegex.exec(s)) !== null) {
    const selectArg = m[1] ?? "";
    const cols = normalizeCols(selectArg);

    if (!isSelectAllowed(cols)) {
      const idx = m.index;
      const lineNo = getLineNumber(s, idx);

      console.error(`❌ Forbidden profiles select columns in: ${f}:${lineNo}`);
      console.error(`   .select("${selectArg}")`);
      console.error(`   ${getLineAt(s, lineNo)}`);
      console.error(
        `   ✅ Allowed columns ONLY: ${Array.from(ALLOWED_PROFILE_COLS).join(", ")}`
      );

      bad = true;
    }
  }
}

if (bad) {
  console.error(
    "\n✅ Fix: profiles may contain ONLY identity/contact fields (id, full_name, company_name, email, role, created_at). " +
      "Never store plan/status/quota in profiles. Use subscriptions + ai_quota instead.\n"
  );
  process.exit(1);
}