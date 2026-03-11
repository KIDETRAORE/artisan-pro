// apps/backend/src/services/projects.service.ts
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export type ProjectRow = {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  status: string;
  budget_cents: number | null;
  created_at: string;
  updated_at: string | null;
};

export type ProjectHealthStatus = "healthy" | "warning" | "critical";

export type ProjectAlert = {
  code:
    | "no_revenue"
    | "budget_exceeded"
    | "budget_high_consumption"
    | "negative_margin"
    | "low_margin";
  level: "info" | "warning" | "critical";
  message: string;
};

export type ProjectExpenseCategory =
  | "materials"
  | "labor"
  | "equipment"
  | "transport"
  | "other";

export type ProjectExpensesByCategory = Record<ProjectExpenseCategory, number>;

export type ProjectAnalytics = {
  revenue_cents: number;
  paid_cents: number;
  expenses_cents: number;
  profit_cents: number;
  profitability_rate: number;
  budget_cents: number;
  remaining_budget_cents: number;
  budget_consumed_rate: number;
  health_status: ProjectHealthStatus;
  alerts: ProjectAlert[];
  expenses_by_category: ProjectExpensesByCategory;
  dominant_expense_category: ProjectExpenseCategory | null;
};

type SalesInvoiceAmountRow = {
  id: string;
  total_amount_cents: number | null;
  status: string | null;
};

type PurchaseBillAmountRow = {
  id: string;
  total_amount_cents: number | null;
  status: string | null;
};

type PaymentAmountRow = {
  id: string;
  project_id: string | null;
  sales_invoice_id: string | null;
  purchase_bill_id: string | null;
  amount_cents: number | null;
  status: string | null;
  direction: string | null;
};

const CreateProjectSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  status: z.string().optional().default("active"),
  budget_cents: z.number().int().nonnegative().optional().nullable(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  budget_cents: z.number().int().nonnegative().optional().nullable(),
});

function toInt(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : 0;
  if (typeof v === "string") {
    const n = Number(v);
    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }
  return 0;
}

function isIncludedSalesInvoiceStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized === "sent" ||
    normalized === "paid" ||
    normalized === "partial" ||
    normalized === "overdue"
  );
}

function isIncludedPurchaseBillStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return (
    normalized === "received" ||
    normalized === "paid" ||
    normalized === "partial" ||
    normalized === "overdue"
  );
}

function isPaidInboundPayment(payment: PaymentAmountRow): boolean {
  return (
    String(payment.direction ?? "").trim().toLowerCase() === "inbound" &&
    String(payment.status ?? "").trim().toLowerCase() === "paid"
  );
}

function sumAmountCents<T extends { total_amount_cents: number | null }>(
  rows: T[]
): number {
  return rows.reduce((sum, row) => sum + toInt(row.total_amount_cents), 0);
}

export class ProjectsService {
  static async listProjects(userId: string): Promise<ProjectRow[]> {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("ProjectsService.listProjects failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list projects");
    }

    return (data ?? []) as ProjectRow[];
  }

  static async createProject(userId: string, input: unknown): Promise<ProjectRow> {
    const parsed = CreateProjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project payload");
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("projects")
      .insert({
        user_id: userId,
        name: payload.name,
        description: payload.description ?? null,
        status: payload.status ?? "active",
        budget_cents: payload.budget_cents ?? null,
      })
      .select("*")
      .single();

    if (error) {
      logger.error("ProjectsService.createProject failed", {
        userId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to create project");
    }

    return data as ProjectRow;
  }

  static async getProject(userId: string, projectId: string): Promise<ProjectRow> {
    const { data, error } = await supabaseAdmin
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("ProjectsService.getProject failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load project");
    }

    if (!data) {
      throw new HttpError(404, "Project not found");
    }

    return data as ProjectRow;
  }

  static async updateProject(
    userId: string,
    projectId: string,
    input: unknown
  ): Promise<ProjectRow> {
    const parsed = UpdateProjectSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project payload");
    }

    await ProjectsService.getProject(userId, projectId);

    const patch = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("projects")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", projectId)
      .eq("user_id", userId)
      .select("*")
      .single();

    if (error) {
      logger.error("ProjectsService.updateProject failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update project");
    }

    return data as ProjectRow;
  }

  static async deleteProject(userId: string, projectId: string): Promise<void> {
    await ProjectsService.getProject(userId, projectId);

    const { error } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", projectId)
      .eq("user_id", userId);

    if (error) {
      logger.error("ProjectsService.deleteProject failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to delete project");
    }
  }

  static async getAnalytics(userId: string, projectId: string): Promise<ProjectAnalytics> {
    const project = await ProjectsService.getProject(userId, projectId);

    const { data: salesInvoiceRows, error: salesInvoicesError } = await supabaseAdmin
      .from("sales_invoices")
      .select("id, total_amount_cents, status")
      .eq("user_id", userId)
      .eq("project_id", projectId);

    if (salesInvoicesError) {
      logger.error("ProjectsService.getAnalytics sales invoices query failed", {
        userId,
        projectId,
        message: salesInvoicesError.message,
      });
      throw new HttpError(500, "Failed to load project sales invoices");
    }

    const { data: purchaseBillRows, error: purchaseBillsError } = await supabaseAdmin
      .from("purchase_bills")
      .select("id, total_amount_cents, status")
      .eq("user_id", userId)
      .eq("project_id", projectId);

    if (purchaseBillsError) {
      logger.error("ProjectsService.getAnalytics purchase bills query failed", {
        userId,
        projectId,
        message: purchaseBillsError.message,
      });
      throw new HttpError(500, "Failed to load project purchase bills");
    }

    const { data: projectExpenseRows, error: expenseRowsError } = await supabaseAdmin
      .from("project_expenses")
      .select("category, amount_cents")
      .eq("user_id", userId)
      .eq("project_id", projectId);

    if (expenseRowsError) {
      logger.error("ProjectsService.getAnalytics category query failed", {
        userId,
        projectId,
        message: expenseRowsError.message,
      });
      throw new HttpError(500, "Failed to load project expenses by category");
    }

    const typedSalesInvoices = ((salesInvoiceRows ?? []) as SalesInvoiceAmountRow[]).filter(
      (row) => isIncludedSalesInvoiceStatus(row.status)
    );

    const typedPurchaseBills = (
      (purchaseBillRows ?? []) as PurchaseBillAmountRow[]
    ).filter((row) => isIncludedPurchaseBillStatus(row.status));

    const salesInvoiceIds = typedSalesInvoices.map((row) => row.id);
    const purchaseBillIds = typedPurchaseBills.map((row) => row.id);

    const paymentCandidates: PaymentAmountRow[] = [];

    const { data: directProjectPayments, error: directPaymentsError } = await supabaseAdmin
      .from("payments")
      .select(
        "id, project_id, sales_invoice_id, purchase_bill_id, amount_cents, status, direction"
      )
      .eq("user_id", userId)
      .eq("project_id", projectId);

    if (directPaymentsError) {
      logger.error("ProjectsService.getAnalytics direct payments query failed", {
        userId,
        projectId,
        message: directPaymentsError.message,
      });
      throw new HttpError(500, "Failed to load project payments");
    }

    paymentCandidates.push(...((directProjectPayments ?? []) as PaymentAmountRow[]));

    if (salesInvoiceIds.length > 0) {
      const { data: invoiceLinkedPayments, error: invoiceLinkedPaymentsError } =
        await supabaseAdmin
          .from("payments")
          .select(
            "id, project_id, sales_invoice_id, purchase_bill_id, amount_cents, status, direction"
          )
          .eq("user_id", userId)
          .in("sales_invoice_id", salesInvoiceIds);

      if (invoiceLinkedPaymentsError) {
        logger.error(
          "ProjectsService.getAnalytics sales invoice payments query failed",
          {
            userId,
            projectId,
            message: invoiceLinkedPaymentsError.message,
          }
        );
        throw new HttpError(500, "Failed to load project invoice payments");
      }

      paymentCandidates.push(
        ...((invoiceLinkedPayments ?? []) as PaymentAmountRow[])
      );
    }

    if (purchaseBillIds.length > 0) {
      const {
        data: purchaseBillLinkedPayments,
        error: purchaseBillLinkedPaymentsError,
      } = await supabaseAdmin
        .from("payments")
        .select(
          "id, project_id, sales_invoice_id, purchase_bill_id, amount_cents, status, direction"
        )
        .eq("user_id", userId)
        .in("purchase_bill_id", purchaseBillIds);

      if (purchaseBillLinkedPaymentsError) {
        logger.error(
          "ProjectsService.getAnalytics purchase bill payments query failed",
          {
            userId,
            projectId,
            message: purchaseBillLinkedPaymentsError.message,
          }
        );
        throw new HttpError(500, "Failed to load project bill payments");
      }

      paymentCandidates.push(
        ...((purchaseBillLinkedPayments ?? []) as PaymentAmountRow[])
      );
    }

    const uniquePayments = Array.from(
      new Map(paymentCandidates.map((payment) => [payment.id, payment])).values()
    );

    const revenueCents = sumAmountCents(typedSalesInvoices);
    const purchaseBillsCents = sumAmountCents(typedPurchaseBills);

    const expensesByCategory: ProjectExpensesByCategory = {
      materials: 0,
      labor: 0,
      equipment: 0,
      transport: 0,
      other: 0,
    };

    let projectExpensesCents = 0;

    for (const expenseRow of projectExpenseRows ?? []) {
      const rawCategory = String(
        (expenseRow as { category?: unknown }).category ?? "other"
      );
      const amount = toInt(
        (expenseRow as { amount_cents?: unknown }).amount_cents
      );

      const category: ProjectExpenseCategory =
        rawCategory === "materials" ||
        rawCategory === "labor" ||
        rawCategory === "equipment" ||
        rawCategory === "transport" ||
        rawCategory === "other"
          ? rawCategory
          : "other";

      expensesByCategory[category] += amount;
      projectExpensesCents += amount;
    }

    const expensesCents = purchaseBillsCents + projectExpensesCents;

    const paidCents = uniquePayments
      .filter(isPaidInboundPayment)
      .reduce((sum, payment) => sum + toInt(payment.amount_cents), 0);

    const profitCents = revenueCents - expensesCents;
    const profitabilityRate =
      revenueCents > 0 ? (profitCents / revenueCents) * 100 : 0;

    const budgetCents = toInt(project.budget_cents);
    const remainingBudgetCents =
      budgetCents > 0 ? budgetCents - expensesCents : 0;
    const budgetConsumedRate =
      budgetCents > 0 ? Math.min(100, (expensesCents / budgetCents) * 100) : 0;

    const alerts: ProjectAlert[] = [];

    if (revenueCents === 0) {
      alerts.push({
        code: "no_revenue",
        level: "info",
        message: "Aucun chiffre d’affaires n’est encore rattaché à ce chantier.",
      });
    }

    if (budgetCents > 0 && expensesCents > budgetCents) {
      alerts.push({
        code: "budget_exceeded",
        level: "critical",
        message: "Le budget chantier est dépassé.",
      });
    } else if (budgetCents > 0 && budgetConsumedRate >= 85) {
      alerts.push({
        code: "budget_high_consumption",
        level: "warning",
        message: "Le chantier a consommé au moins 85% de son budget.",
      });
    }

    if (revenueCents > 0 && profitCents < 0) {
      alerts.push({
        code: "negative_margin",
        level: "critical",
        message: "Le chantier est actuellement à perte.",
      });
    } else if (revenueCents > 0 && profitabilityRate < 15) {
      alerts.push({
        code: "low_margin",
        level: "warning",
        message: "La marge du chantier est très faible (< 15%).",
      });
    }

    let healthStatus: ProjectHealthStatus = "healthy";

    if (
      alerts.some((alert) => alert.level === "critical") ||
      (budgetCents > 0 && expensesCents > budgetCents) ||
      (revenueCents > 0 && profitCents < 0)
    ) {
      healthStatus = "critical";
    } else if (
      alerts.some((alert) => alert.level === "warning") ||
      (budgetCents > 0 && budgetConsumedRate >= 85) ||
      (revenueCents > 0 && profitabilityRate < 30)
    ) {
      healthStatus = "warning";
    }

    let dominantExpenseCategory: ProjectExpenseCategory | null = null;
    let dominantAmount = 0;

    for (const [category, amount] of Object.entries(
      expensesByCategory
    ) as Array<[ProjectExpenseCategory, number]>) {
      if (amount > dominantAmount) {
        dominantAmount = amount;
        dominantExpenseCategory = category;
      }
    }

    return {
      revenue_cents: revenueCents,
      paid_cents: paidCents,
      expenses_cents: expensesCents,
      profit_cents: profitCents,
      profitability_rate: profitabilityRate,
      budget_cents: budgetCents,
      remaining_budget_cents: remainingBudgetCents,
      budget_consumed_rate: budgetConsumedRate,
      health_status: healthStatus,
      alerts,
      expenses_by_category: expensesByCategory,
      dominant_expense_category: dominantExpenseCategory,
    };
  }
}