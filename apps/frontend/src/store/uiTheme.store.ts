// apps/frontend/src/store/uiTheme.store.ts
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type UITheme = "classic" | "midnight" | "sunset";

type UIThemeState = {
  theme: UITheme;
  setTheme: (theme: UITheme) => void;
};

export const UI_THEME_LABELS: Record<UITheme, string> = {
  classic: "Classic",
  midnight: "Midnight",
  sunset: "Sunset",
};

export const useUIThemeStore = create<UIThemeState>()(
  persist(
    (set) => ({
      theme: "classic",
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: "artisanpro-ui-theme",
      storage: createJSONStorage(() => localStorage),
    }
  )
);