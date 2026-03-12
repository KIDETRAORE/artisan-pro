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

function toCentsFromUnknown(v: unknown): number {
  if (typeof v === "number") {
    return Number.isFinite(v) ? Math.round(v) : 0;
  }

  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.round(n) : 0;
  }

  return 0;
}

export class DashboardController {
  static async getDashboard(req: Request, res: Response) {
    const r = req as AuthedRequest;
    const user = r.user;

    if (!user?.id) {
      throw new HttpError(401, "Unauthorized");
    }

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

    const quota = await quotaService.getUserQuota(user.id);

    const used = quota?.used ?? 0;
    const limit = quota?.monthly_limit ?? 0;
    const resetAt = quota?.reset_at ?? null;

    const percent =
      limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0;

    const isProActive =
      isPro(plan) && (statusRaw === "active" || statusRaw === "trialing");

    const features = {
      generate: true,
      analyze: isProActive,
      history: isProActive,
    };

    const { data: salesInvoicesRows, error: salesInvoicesErr } =
      await supabaseAdmin
        .from("sales_invoices")
        .select("id, total_cents, due_date, status, contact_id")
        .eq("user_id", user.id);

    if (salesInvoicesErr) {
      logger.error("Dashboard: erreur récupération sales_invoices", {
        userId: user.id,
        message: salesInvoicesErr.message,
      });
      throw new HttpError(500, "Erreur lors du chargement du dashboard");
    }

    const salesInvoices = (salesInvoicesRows ?? []) as Array<{
      id: string;
      total_cents: unknown;
      due_date: string | null;
      status: string | null;
      contact_id: string | null;
    }>;

    const contactIds = Array.from(
      new Set(
        salesInvoices
          .map((row) => row.contact_id)
          .filter(
            (value): value is string =>
              typeof value === "string" && value.trim().length > 0
          )
      )
    );

    const contactNameMap = new Map<string, string>();

    if (contactIds.length > 0) {
      const { data: contactsRows, error: contactsErr } = await supabaseAdmin
        .from("contacts")
        .select("id, name")
        .in("id", contactIds);

      if (contactsErr) {
        logger.warn("Dashboard: erreur récupération contacts", {
          userId: user.id,
          message: contactsErr.message,
        });
      } else {
        for (const row of (contactsRows ?? []) as Array<{
          id: string;
          name: string | null;
        }>) {
          contactNameMap.set(row.id, row.name?.trim() || "Client");
        }
      }
    }

    const nowIso = new Date().toISOString();

    const paidStatuses = new Set(["paid"]);
    const unpaidStatuses = new Set(["sent", "overdue"]);

    const paidInvoices = salesInvoices.filter((row) =>
      paidStatuses.has(String(row.status ?? "").toLowerCase())
    );

    const unpaidInvoices = salesInvoices.filter((row) =>
      unpaidStatuses.has(String(row.status ?? "").toLowerCase())
    );

    const overdueInvoices = unpaidInvoices.filter((row) => {
      const dueDate = typeof row.due_date === "string" ? row.due_date.trim() : "";
      if (!dueDate) {
        return false;
      }

      const dueIso = new Date(dueDate).toISOString();
      return dueIso < nowIso;
    });

    const paidAllTimeCents = paidInvoices.reduce(
      (acc, row) => acc + toCentsFromUnknown(row.total_cents),
      0
    );

    const currentMonthPrefix = new Date().toISOString().slice(0, 7);

    const paidMonthCents = paidInvoices.reduce((acc, row) => {
      const dueDate = typeof row.due_date === "string" ? row.due_date.trim() : "";
      if (dueDate.startsWith(currentMonthPrefix)) {
        return acc + toCentsFromUnknown(row.total_cents);
      }
      return acc;
    }, 0);

    const unpaidTotalCents = unpaidInvoices.reduce(
      (acc, row) => acc + toCentsFromUnknown(row.total_cents),
      0
    );

    const overdueTotalCents = overdueInvoices.reduce(
      (acc, row) => acc + toCentsFromUnknown(row.total_cents),
      0
    );

    const preview: InvoicePreview[] = unpaidInvoices
      .map((row) => {
        const dueIso = row.due_date
          ? new Date(row.due_date).toISOString()
          : new Date(0).toISOString();
        const late =
          row.due_date && dueIso < nowIso ? daysBetween(dueIso, nowIso) : 0;

        return {
          id: row.id,
          client: row.contact_id
            ? contactNameMap.get(row.contact_id) ?? "Client"
            : "Client",
          totalAmountCents: toCentsFromUnknown(row.total_cents),
          dueDate: dueIso,
          status: String(row.status ?? ""),
          daysLate: late,
        };
      })
      .sort((a, b) => {
        if (b.daysLate !== a.daysLate) return b.daysLate - a.daysLate;
        if (b.totalAmountCents !== a.totalAmountCents) {
          return b.totalAmountCents - a.totalAmountCents;
        }
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
        unpaidCount: unpaidInvoices.length,
        unpaidTotalCents,
        overdueCount: overdueInvoices.length,
        overdueTotalCents,
        preview,
      },
      quotes: {
        pendingCount: quotesPendingCount ?? 0,
      },
    };

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
        const rj = lastCompta.response_json as
          | {
              copilot?: CopilotSnapshot | null;
              snapshot?: CopilotSnapshot | null;
              copilotSnapshot?: CopilotSnapshot | null;
            }
          | null;

        const maybe = rj?.copilot ?? rj?.snapshot ?? rj?.copilotSnapshot ?? null;

        if (maybe && typeof maybe === "object") {
          copilotSnapshot = maybe;
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
      kpis: kpisPayload,
      copilotSnapshot,
      copilotAnalysisId,
    });
  }
}