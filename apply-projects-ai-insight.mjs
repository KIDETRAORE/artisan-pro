
import fs from "fs";
import path from "path";

const root = process.cwd();

const filePath = path.join(
  root,
  "apps/frontend/src/pages/Projects.tsx"
);

if (!fs.existsSync(filePath)) {
  console.error("Projects.tsx not found");
  process.exit(1);
}

let content = fs.readFileSync(filePath, "utf8");

if (!content.includes("Conseil IA")) {

const block = `

      {/* ===== AI INSIGHT ===== */}
      <div className="rounded-2xl border border-[var(--theme-border)] bg-[var(--theme-card)] p-5 shadow-sm">
        <h3 className="text-sm font-bold text-[var(--theme-text)] mb-2">
          Conseil IA
        </h3>

        <p className="text-sm text-[var(--theme-muted)]">
          Vérifiez la marge de vos chantiers actifs. Un suivi régulier des dépenses
          permet d'améliorer la rentabilité globale.
        </p>
      </div>
`

content = content.replace(
  '<div className="space-y-6 p-6">',
  '<div className="space-y-6 p-6">' + block
)

fs.writeFileSync(filePath, content)

console.log("AI insight injected into Projects.tsx")

} else {
  console.log("AI insight already present")
}
