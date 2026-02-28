import fs from "node:fs";
import path from "node:path";

const files = process.argv.slice(2);
if (!files.length) process.exit(0);

// Patterns interdits: réponses d'erreur "string"
const forbidden = [
  // json({ success:false, error:"..." })
  /json\s*\(\s*{[^}]*\bsuccess\s*:\s*false\b[^}]*\berror\s*:\s*["'`]/ms,
  // res.status(...).json({ error:"..." })
  /status\s*\([^)]*\)\s*\.\s*json\s*\(\s*{[^}]*\berror\s*:\s*["'`]/ms,
  // res.json({ error:"..." })
  /res\s*\.\s*json\s*\(\s*{[^}]*\berror\s*:\s*["'`]/ms,
];

let bad = false;

for (const f of files) {
  if (!f.endsWith(".ts") && !f.endsWith(".tsx")) continue;
  const abs = path.resolve(f);
  if (!fs.existsSync(abs)) continue;

  const s = fs.readFileSync(abs, "utf8");
  if (forbidden.some((re) => re.test(s))) {
    console.error(`❌ Forbidden error response shape found in: ${f}`);
    bad = true;
  }
}

if (bad) {
  console.error(
    "\n✅ Fix: use sendError(req,res,...) OR throw new HttpError(...)\n"
  );
  process.exit(1);
}