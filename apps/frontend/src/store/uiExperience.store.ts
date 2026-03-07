// apps/frontend/src/store/uiExperience.store.ts

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type UIExperienceMode = "embedded-lite" | "embedded-panel";

export const UI_EXPERIENCE_LABELS: Record<UIExperienceMode, string> = {
  "embedded-lite": "Mode Synthèse",
  "embedded-panel": "Mode Analyse",
};

type UIExperienceState = {
  mode: UIExperienceMode;
  setMode: (mode: UIExperienceMode) => void;
};

export const useUIExperienceStore = create<UIExperienceState>()(
  persist(
    (set) => ({
      mode: "embedded-lite",
      setMode: (mode) => set({ mode }),
    }),
    {
      name: "artisanpro-ui-experience",
    }
  )
);