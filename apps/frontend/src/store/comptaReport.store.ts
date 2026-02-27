import { create } from "zustand";

export type ComptaReport = any; // tu pourras typer ensuite

type State = {
  report: ComptaReport | null;
  setReport: (r: ComptaReport) => void;
  clearReport: () => void;
};

export const useComptaReportStore = create<State>((set) => ({
  report: null,
  setReport: (report) => set({ report }),
  clearReport: () => set({ report: null }),
}));