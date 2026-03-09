// apps/frontend/src/store/expertChat.store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

type ExpertChatState = {
  analysisId: string | null;
  setAnalysisId: (id: string | null) => void;
  clearAnalysisId: () => void;
};

export const useExpertChatStore = create<ExpertChatState>()(
  persist(
    (set) => ({
      analysisId: null,
      setAnalysisId: (id) => set({ analysisId: id ? String(id) : null }),
      clearAnalysisId: () => set({ analysisId: null }),
    }),
    {
      name: "artisanpro_expert_chat",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ analysisId: state.analysisId }),
    }
  )
);