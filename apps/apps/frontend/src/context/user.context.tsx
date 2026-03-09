import {
  createContext,
  useContext,
  useState,
  ReactNode,
  useCallback,
  useMemo,
} from "react";

/* ============================
    TYPES
============================ */

export type Quota = {
  used: number;
  limit: number;
};

export type Plan = "free" | "pro";
export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "past_due"
  | "unpaid"
  | "paused"
  | "inactive"
  | "unknown";

export const normalizePlan = (plan?: string | null): Plan => {
  const p = String(plan ?? "free").toLowerCase();
  return p === "pro" ? "pro" : "free";
};

export const normalizeStatus = (status?: string | null): SubscriptionStatus => {
  const s = String(status ?? "unknown").toLowerCase();
  const allowed: Record<string, SubscriptionStatus> = {
    active: "active",
    trialing: "trialing",
    canceled: "canceled",
    incomplete: "incomplete",
    incomplete_expired: "incomplete_expired",
    past_due: "past_due",
    unpaid: "unpaid",
    paused: "paused",
    inactive: "inactive",
    unknown: "unknown",
  };
  return allowed[s] ?? "unknown";
};

export const isProActive = (plan?: string | null, status?: string | null) => {
  const p = normalizePlan(plan);
  const s = normalizeStatus(status);
  return p === "pro" && (s === "active" || s === "trialing");
};

export type UserData = {
  name?: string;
  email?: string;
  plan?: Plan;
  status?: SubscriptionStatus;
  quota?: Quota;
};

type UserContextType = {
  userData: UserData | null;
  setUserData: (data: UserData | null) => void;
  clearUserData: () => void;
};

/* ============================
    CONTEXT
============================ */

const UserContext = createContext<UserContextType | undefined>(undefined);

/* ============================
    PROVIDER
============================ */

export function UserProvider({ children }: { children: ReactNode }) {
  const [userData, setUserData] = useState<UserData | null>(null);

  // ✅ FIX: fonction stable (sinon boucle de useEffect côté App.tsx)
  const clearUserData = useCallback(() => {
    setUserData(null);
  }, []);

  // ✅ FIX: value stable (évite rerenders inutiles)
  const value = useMemo(
    () => ({ userData, setUserData, clearUserData }),
    [userData, clearUserData]
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

/* ============================
    HOOK
============================ */

export function useUser() {
  const context = useContext(UserContext);

  if (!context) {
    throw new Error("useUser must be used inside UserProvider");
  }

  return context;
}