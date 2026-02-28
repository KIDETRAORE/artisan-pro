// apps/backend/src/types/plan.ts

// Type historique (utilisé par certains controllers)
export type Plan = "FREE" | "PRO";

// Type normalisé (source de vérité)
export type PlanNormalized = "free" | "pro";

export function normalizePlan(plan?: string | null): PlanNormalized {
  const p = String(plan ?? "free").trim().toLowerCase();
  return p === "pro" ? "pro" : "free";
}

export function isPro(plan?: string | null): boolean {
  return normalizePlan(plan) === "pro";
}

export type SubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "unpaid"
  | "incomplete"
  | "incomplete_expired"
  | "paused"
  | "inactive";

export function normalizeStatus(status?: string | null): SubscriptionStatus {
  const s = String(status ?? "inactive").trim().toLowerCase();
  switch (s) {
    case "active":
    case "trialing":
    case "past_due":
    case "canceled":
    case "unpaid":
    case "incomplete":
    case "incomplete_expired":
    case "paused":
      return s;
    default:
      return "inactive";
  }
}

export function isProActive(plan?: string | null, status?: string | null): boolean {
  const st = normalizeStatus(status);
  return isPro(plan) && (st === "active" || st === "trialing");
}