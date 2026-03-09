// apps/frontend/src/store/comptaReport.store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import {
  ComptaReportSchema,
  type ComptaReport,
} from "../schemas/comptaReport.schema";

interface ComptaReportState {
  report: ComptaReport | null;
  setReport: (report: ComptaReport) => void;
  clearReport: () => void;
}

/**
 * ✅ Persist du dernier report Compta dans le navigateur
 * - Persistance localStorage
 * - Validation Zod
 * - Synchronisation multi-tabs
 */
export const useComptaReportStore = create<ComptaReportState>()(
  persist(
    (set) => ({
      report: null,

      setReport: (report) => {
        const parsed = ComptaReportSchema.safeParse(report);

        if (!parsed.success) {
          return;
        }

        set({ report: parsed.data });
      },

      clearReport: () => set({ report: null }),
    }),
    {
      name: "artisanpro:comptaReport",

      storage: createJSONStorage(() => localStorage),

      partialize: (state) => ({
        report: state.report,
      }),

      onRehydrateStorage: () => (state) => {
        if (!state?.report) return;

        const parsed = ComptaReportSchema.safeParse(state.report);

        if (!parsed.success) {
          state.clearReport();
        }
      },
    }
  )
);