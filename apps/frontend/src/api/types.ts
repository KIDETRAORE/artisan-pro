// apps/frontend/src/api/types.ts
import type { Json200, JsonError, PathParams } from "./openapiTypes";

// Dashboard
export type DashboardResponse = Json200<"/dashboard", "get">;

// AI run
export type AiRunResponse = Json200<"/ai/run", "post">;
export type AiRunQuotaError = JsonError<"/ai/run", "post", 403>;

// AI status
export type AiStatusResponse = Json200<"/ai/status/{jobId}", "get">;
export type AiStatusPathParams = PathParams<"/ai/status/{jobId}", "get">;

// Stripe
export type StripeCheckoutResponse = Json200<
  "/stripe/create-checkout-session",
  "post"
>;
export type StripePortalResponse = Json200<"/stripe/portal", "post">;