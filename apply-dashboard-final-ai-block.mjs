
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

if (!content.includes("Priorités du jour")) {
  const injection = `

      {/* ===== IA PRIORITIES ===== */}
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-xl">
          <h3 className="text-lg font-bold text-[var(--theme-text)] mb-4">
            Priorités du jour
          </h3>

          <ul className="space-y-2 text-sm text-[var(--theme-text)]">
            <li>• Relancer les devis en attente</li>
            <li>• Vérifier les factures en retard</li>
            <li>• Contrôler la marge des chantiers actifs</li>
          </ul>
        </div>

        <div className="rounded-3xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-6 shadow-xl">
          <h3 className="text-lg font-bold text-[var(--theme-text)] mb-4">
            Conseils ArtisanPro
          </h3>

          <p className="text-sm text-[var(--theme-text)] leading-relaxed">
            Votre trésorerie est stable. Pensez à relancer les factures en
            retard pour sécuriser votre cash-flow et augmenter votre marge
            sur les prochains devis.
          </p>
        </div>
      </div>
`;

  content = content.replace(
    "export default function Dashboard() {",
    "export default function Dashboard() {\n"
  );

  content = content.replace(
    "</div>\n  );",
    `${injection}\n</div>\n  );`
  );

  fs.writeFileSync(dashboardPath, content);
  console.log("Patch Dashboard IA appliqué");
} else {
  console.log("Patch déjà appliqué");
}
