// scripts/guards/guard-ai-queue-precheck.mjs
import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) process.exit(0);

/**
 * Anti-regression: any route/controller that enqueues an AI job MUST
 * run a quota pre-check BEFORE enqueue (route-level).
 *
 * Heuristic guard:
 * - If a file contains `aiQueue.add(` then it must also contain one of:
 *   - `quotaMiddleware`
 *   - `quotaService.checkQuota`
 *   - `.checkQuota(`
 *   - `checkQuota(`
 *
 * This intentionally fails fast to prevent "enqueue then fail in worker".
 */

const enqueueRe = /\baiQueue\s*\.\s*add\s*\(/m;

const allowedSignals = [
  /\bquotaMiddleware\b/m,
  /\bquotaService\s*\.\s*checkQuota\s*\(/m,
  /\.\s*checkQuota\s*\(/m,
  /\bcheckQuota\s*\(/m,
];

let bad = false;

for (const f of files) {
  if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) continue;

  const s = fs.readFileSync(abs, "utf8");

  if (!enqueueRe.test(s)) continue;

  const ok = allowedSignals.some((re) => re.test(s));
  if (!ok) {
    console.error(`❌ Missing quota pre-check before aiQueue.add() in: ${f}`);
    bad = true;
  }
}

if (bad) {
  console.error(
    [
      "",
      "✅ Fix (required):",
      "- Add quota pre-check BEFORE enqueue (read-only).",
      "- Either add `quotaMiddleware` to the route chain, OR call `quotaService.checkQuota(userId, feature)` before `aiQueue.add(...)`.",
      "",
    ].join("\n")
  );
  process.exit(1);
}