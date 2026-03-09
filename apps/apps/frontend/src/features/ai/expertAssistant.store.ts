import { create } from "zustand";

export type ExpertPayload = {
  source: "compta" | "vision" | "devis" | "other";
  message?: string;

  // ✅ MODIF: ajouter analysisId (pour pipeline expert basé DB)
  analysisId?: string;

  // (inchangé) compat legacy / fallback
  analysisData?: unknown; // on peut typer précisément plus tard (ex: ComptaReport)

  createdAt: string;
};

type ExpertAssistantState = {
  isOpen: boolean;
  payload: ExpertPayload | null;

  openWith: (payload: ExpertPayload) => void;
  open: () => void;
  close: () => void;
  clear: () => void;
};

export const useExpertAssistantStore = create<ExpertAssistantState>((set) => ({
  isOpen: false,
  payload: null,

  openWith: (payload) => set({ isOpen: true, payload }),
  open: () => set({ isOpen: true }),
  close: () => set({ isOpen: false }),
  clear: () => set({ payload: null }),
}));