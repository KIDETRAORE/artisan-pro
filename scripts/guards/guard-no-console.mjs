import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) process.exit(0);

let bad = false;

for (const f of files) {
  if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) continue;

  const s = fs.readFileSync(abs, "utf8");
  if (/\bconsole\.(log|debug|info|warn|error)\b/.test(s)) {
    // tolère éventuellement logger.ts si tu y wraps console (mais idéalement non)
    console.error(`❌ console.* found in: ${f}`);
    bad = true;
  }
}

if (bad) {
  console.error("\n✅ Fix: use logger.* instead of console.*\n");
  process.exit(1);
}