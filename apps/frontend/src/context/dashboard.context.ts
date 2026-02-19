import { createContext, useContext } from "react";

type DashboardData = {
  plan?: string;
  quota?: {
    used: number;
    limit: number;
  };
};

export const DashboardContext = createContext<DashboardData | null>(null);

export const useDashboard = () => {
  return useContext(DashboardContext);
};
