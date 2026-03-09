// apps/frontend/src/features/ai/AiModePanel.tsx
import { Sparkles } from "lucide-react";

export default function AiModePanel() {
  return (
    <div className="p-4 space-y-4">
      <div className="bg-[var(--theme-card)] rounded-3xl border border-[var(--theme-border)] shadow-sm p-4">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-purple-600" />
          <h3 className="text-xs font-black uppercase tracking-widest text-[var(--theme-text)]">
            Stratégie IA
          </h3>
        </div>

        <p className="mt-3 text-sm text-[var(--theme-muted)] font-semibold">
          Fonctionnalité en préparation.
        </p>

        <div className="mt-3 text-xs text-[var(--theme-muted)]">
          Cette section proposera bientôt :
          <ul className="list-disc ml-5 mt-2 space-y-1">
            <li>Recommandations automatiques après analyse Compta</li>
            <li>Alertes (TVA, marge, trésorerie, anomalies)</li>
            <li>Plan d’actions priorisé</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
