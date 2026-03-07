
import fs from "fs";
import path from "path";

const root = process.cwd();

const dashboardPath = path.join(
  root,
  "apps/frontend/src/pages/Dashboard.tsx"
);

if (!fs.existsSync(dashboardPath)) {
  console.error("Dashboard.tsx not found");
  process.exit(1);
}

let content = fs.readFileSync(dashboardPath, "utf8");

if (!content.includes("Chantiers actifs")) {
  const block = `

      {/* ===== PROJECTS PREVIEW ===== */}
      <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-xl mt-8">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-[var(--theme-text)]">
            Chantiers actifs
          </h3>

          <a
            href="/projects"
            className="text-xs font-bold uppercase tracking-widest text-[var(--theme-primary)] hover:opacity-80"
          >
            Voir tous
          </a>
        </div>

        <div className="space-y-3 text-sm text-[var(--theme-text)]">
          <div className="flex justify-between">
            <span>Maison Dupont</span>
            <span className="text-[var(--theme-muted)]">60%</span>
          </div>

          <div className="flex justify-between">
            <span>Appartement Martin</span>
            <span className="text-[var(--theme-muted)]">30%</span>
          </div>
        </div>
      </div>
`

  content = content.replace(
    "</div>\n  );",
    block + "\n</div>\n  );"
  );

  fs.writeFileSync(dashboardPath, content);
  console.log("Patch 'Chantiers actifs' appliqué au Dashboard");
} else {
  console.log("Le bloc 'Chantiers actifs' existe déjà, patch ignoré.");
}
