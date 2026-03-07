import { execSync } from "node:child_process";
import "./guard-no-hardcoded-ui-colors.mjs";

function run(cmd) {
  execSync(cmd, { stdio: "inherit" });
}

// On scanne tout le backend (pas seulement staged)
run('node scripts/guards/guard-error-shape.mjs "apps/backend/src/index.ts"');
run('node scripts/guards/guard-profiles-misuse.mjs "apps/backend/src/index.ts"');
run('node scripts/guards/guard-quota-writes.mjs "apps/backend/src/index.ts"');

// Truc: les guards actuels prennent une liste de fichiers; on veut tout.
run('node scripts/guards/glob-runner.mjs scripts/guards/guard-error-shape.mjs "apps/backend/src/**/*.{ts,tsx}"');
run('node scripts/guards/glob-runner.mjs scripts/guards/guard-profiles-misuse.mjs "apps/backend/src/**/*.{ts,tsx}"');
run('node scripts/guards/glob-runner.mjs scripts/guards/guard-quota-writes.mjs "apps/backend/src/**/*.{ts,tsx}"');

 // On scanne tout le backend (pas seulement staged)
 run('node scripts/guards/guard-error-shape.mjs "apps/backend/src/index.ts"');
 run('node scripts/guards/guard-profiles-misuse.mjs "apps/backend/src/index.ts"');
 run('node scripts/guards/guard-quota-writes.mjs "apps/backend/src/index.ts"');
+run('node scripts/guards/guard-ai-queue-precheck.mjs "apps/backend/src/index.ts"');

 // Truc: les guards actuels prennent une liste de fichiers; on veut tout.
 run('node scripts/guards/glob-runner.mjs scripts/guards/guard-error-shape.mjs "apps/backend/src/**/*.{ts,tsx}"');
 run('node scripts/guards/glob-runner.mjs scripts/guards/guard-profiles-misuse.mjs "apps/backend/src/**/*.{ts,tsx}"');
 run('node scripts/guards/glob-runner.mjs scripts/guards/guard-quota-writes.mjs "apps/backend/src/**/*.{ts,tsx}"');
+run('node scripts/guards/glob-runner.mjs scripts/guards/guard-ai-queue-precheck.mjs "apps/backend/src/**/*.{ts,tsx}"');

console.log("\n✅ All guards passed.");