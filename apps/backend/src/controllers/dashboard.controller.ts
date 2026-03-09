// apps/backend/src/controllers/dashboard.controller.ts
import type { Request, Response } from "express";
import type { Plan } from "../domain/plan";
import { normalizePlan, isPro } from "../domain/plan";
import { quotaService } from "../services/quota.service";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";

type AuthedRequest = Request & {
  user?: { id: string; email?: string };
};

// ✅ AJOUT UNIQUE: type snapshot (optionnel, n'impacte pas l'existant)
type CopilotSnapshot = {
  title: string;
  alerts: Array<{ severity: "critical" | "warn" | "info"; label: string }>;
  actions: string[];
  toCheck: string;
  nextStep: string;
  questions: string[];
  figures: {
    tvaAPayer: number;
    tvaCollectee: number;
    tvaDeductible: number;
    recettesHT: number;
    depensesHT: number;
    resultatNet: number;
  };
};

type InvoicePreview = {
  id: string;
  client: string;
  totalAmountCents: number;
  dueDate: string;
  status: string;
  daysLate: number;
};

function daysBetween(fromIso: string, toIso: string): number {
  const a = new Date(fromIso).getTime();
  const b = new Date(toIso).getTime();
  const diff = b - a;
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ✅ helper: parse cents from rpc (number | string | null)
function toCentsFromUnknown(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }
  return 0;
}

export class DashboardController {
  /**
   * GET /dashboard
   * ➜ endpoint protégé (authMiddleware requis)
   */
  static async getDashboard(req: Request, res: Response) {
    const r = req as AuthedRequest;
    const user = r.user;

    if (!user?.id) {
      throw new HttpError(401, "Unauthorized");
    }

    // ===============================
    // ✅ Source de vérité PLAN/STATUS : subscriptions
    // ===============================
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan,status,current_period_end")
      .eq("user_id", user.id)
      .maybeSingle();

    if (subErr) {
      logger.error("Dashboard: erreur récupération subscription", {
        userId: user.id,
        message: subErr.message,
      });
      throw new HttpError(500, "Erreur lors du chargement du dashboard");
    }

    const planNorm = normalizePlan(sub?.plan);
    const statusRaw = String(sub?.status ?? "inactive").toLowerCase();

    const plan: Plan = planNorm === "pro" ? "PRO" : "FREE";

    const subscription = {
      plan,
      status: statusRaw,
      currentPeriodEnd: sub?.current_period_end ?? null,
    };

    // ===============================
    // ✅ Source de vérité QUOTA : ai_quota
    // ===============================
    const quota = await quotaService.getUserQuota(user.id);

    const used = quota?.used ?? 0;
    const limit = quota?.monthly_limit ?? 0;
    const resetAt = quota?.reset_at ?? null;

    const percent =
      limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    // ===============================
    // Features (si tu veux les baser sur plan+status)
    // ===============================
    const isProActive =
      isPro(plan) && (statusRaw === "active" || statusRaw === "trialing");

    const features = {
      generate: true,
      analyze: isProActive,
      history: isProActive,
    };

    // ===============================
    // ✅ KPI FACTURES via RPC (perf)
    // ===============================
    const { data: kpis, error: kpisErr } = await supabaseAdmin.rpc(
      "get_dashboard_kpis",
      { p_user_id: user.id }
    );

    if (kpisErr) {
      logger.error("Dashboard: erreur RPC get_dashboard_kpis", {
        userId: user.id,
        message: kpisErr.message,
      });
      throw new HttpError(500, "Erreur lors du chargement du dashboard");
    }

    const kpisData: any = kpis ?? {};

    const paidAllTimeCents = toCentsFromUnknown(kpisData.paid_all_time_cents);
    const paidMonthCents = toCentsFromUnknown(kpisData.paid_month_cents);
    const unpaidTotalCents = toCentsFromUnknown(kpisData.unpaid_total_cents);

    // ===============================
    // ✅ Preview relances (best effort, léger)
    // (On ne fait plus de reduce global; on charge uniquement impayés)
    // ===============================
    const nowIso = new Date().toISOString();

    const { data: unpaidRows, error: unpaidErr } = await supabaseAdmin
      .from("invoices")
      .select("id, client_name, total_amount_cents, due_date, status")
      .eq("user_id", user.id)
      .in("status", ["sent", "overdue"]);

    if (unpaidErr) {
      logger.warn("Dashboard: erreur récupération preview unpaid invoices", {
        userId: user.id,
        message: unpaidErr.message,
      });
    }

    const unpaid = ((unpaidRows ?? []) as Array<{
      id: string;
      client_name: string;
      total_amount_cents: unknown;
      due_date: string;
      status: string;
    }>).map((it) => ({
      id: it.id,
      client_name: it.client_name,
      total_amount_cents: it.total_amount_cents,
      due_date: it.due_date,
      status: it.status,
    }));

    const overdue = unpaid.filter((it) => {
      const dueIso = new Date(it.due_date).toISOString();
      return dueIso < nowIso;
    });

    const overdueTotalCents = overdue.reduce(
      (acc, it) => acc + toCentsFromUnknown(it.total_amount_cents),
      0
    );

    const preview: InvoicePreview[] = unpaid
      .map((it) => {
        const dueIso = new Date(it.due_date).toISOString();
        const late = dueIso < nowIso ? daysBetween(dueIso, nowIso) : 0;
        return {
          id: it.id,
          client: it.client_name,
          totalAmountCents: toCentsFromUnknown(it.total_amount_cents),
          dueDate: dueIso,
          status: String(it.status),
          daysLate: late,
        };
      })
      .sort((a, b) => {
        if (b.daysLate !== a.daysLate) return b.daysLate - a.daysLate;
        if (b.totalAmountCents !== a.totalAmountCents)
          return b.totalAmountCents - a.totalAmountCents;
        return a.dueDate.localeCompare(b.dueDate);
      })
      .slice(0, 3);

    const { count: quotesPendingCount, error: quotesErr } = await supabaseAdmin
      .from("quotes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "pending");

    if (quotesErr) {
      logger.error("Dashboard: erreur récupération quotes pending count", {
        userId: user.id,
        message: quotesErr.message,
      });
      throw new HttpError(500, "Erreur lors du chargement du dashboard");
    }

    const kpisPayload = {
      revenue: {
        paidAllTimeCents,
        paidMonthCents,
      },
      invoices: {
        unpaidCount: unpaid.length,
        unpaidTotalCents,
        overdueCount: overdue.length,
        overdueTotalCents,
        preview,
      },
      quotes: {
        pendingCount: quotesPendingCount ?? 0,
      },
    };

    // ===============================
    // ✅ AJOUT UNIQUE: dernier snapshot copilote (best effort)
    // ===============================
    let copilotSnapshot: CopilotSnapshot | null = null;
    let copilotAnalysisId: string | null = null;

    try {
      const { data: lastCompta, error: lastErr } = await supabaseAdmin
        .from("ai_logs")
        .select("id, response_json")
        .eq("user_id", user.id)
        .eq("feature", "compta")
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!lastErr && lastCompta?.response_json) {
        const rj: any = lastCompta.response_json as any;
        const maybe = rj?.copilot ?? rj?.snapshot ?? rj?.copilotSnapshot ?? null;

        if (maybe && typeof maybe === "object") {
          copilotSnapshot = maybe as CopilotSnapshot;
          copilotAnalysisId = String(lastCompta.id);
        }
      }
    } catch {
      copilotSnapshot = null;
      copilotAnalysisId = null;
    }

    return res.status(200).json({
      message: "Dashboard accessible",
      user: {
        id: user.id,
        email: user.email ?? null,
      },
      subscription,
      features,
      quota: {
        used,
        limit,
        percent,
        resetAt,
      },

      // ✅ KPI via RPC (Postgres calcule)
      kpis: kpisPayload,

      // ✅ optionnel, compat backward
      copilotSnapshot,
      copilotAnalysisId,
    });
  }
}