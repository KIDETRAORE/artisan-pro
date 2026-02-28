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
  if (/\b@ts-ignore\b/.test(s)) {
    console.error(`❌ @ts-ignore found in: ${f}`);
    bad = true;
  }
}

if (bad) {
  console.error("\n✅ Fix: use Stripe v20 safe casts (obj as any), never @ts-ignore.\n");
  process.exit(1);
}