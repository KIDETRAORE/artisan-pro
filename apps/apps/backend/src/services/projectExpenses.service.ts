// apps/backend/src/services/projectExpenses.service.ts
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export type ProjectExpenseCategory =
  | "materials"
  | "labor"
  | "equipment"
  | "transport"
  | "other";

export type ProjectExpenseRow = {
  id: string;
  user_id: string;
  project_id: string;
  description: string;
  amount_cents: number;
  category: ProjectExpenseCategory | null;
  expense_date: string | null;
  created_at: string;
};

const ExpenseCategorySchema = z.enum([
  "materials",
  "labor",
  "equipment",
  "transport",
  "other",
]);

const CreateExpenseSchema = z.object({
  label: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  vendor: z.string().optional().nullable(),
  occurred_at: z.string().optional().nullable(),
});

const UpdateExpenseSchema = z.object({
  label: z.string().min(1).optional(),
  amount_cents: z.number().int().nonnegative().optional(),
  vendor: z.string().optional().nullable(),
  occurred_at: z.string().optional().nullable(),
  category: ExpenseCategorySchema.optional().nullable(),
});

function normalizeExpenseDate(value?: string | null): string | null {
  if (!value) return null;

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

export class ProjectExpensesService {
  static async listExpenses(
    userId: string,
    projectId: string
  ): Promise<ProjectExpenseRow[]> {
    const { data, error } = await supabaseAdmin
      .from("project_expenses")
      .select("id, user_id, project_id, description, amount_cents, category, expense_date, created_at")
      .eq("user_id", userId)
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("ProjectExpensesService.listExpenses failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to list project expenses");
    }

    return (data ?? []) as ProjectExpenseRow[];
  }

  static async createExpense(
    userId: string,
    projectId: string,
    input: unknown
  ): Promise<ProjectExpenseRow> {
    const parsed = CreateExpenseSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project expense payload");
    }

    const payload = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("project_expenses")
      .insert({
        user_id: userId,
        project_id: projectId,
        description: payload.label,
        amount_cents: payload.amount_cents,
        expense_date: normalizeExpenseDate(payload.occurred_at),
        category: "other",
      })
      .select("id, user_id, project_id, description, amount_cents, category, expense_date, created_at")
      .single();

    if (error) {
      logger.error("ProjectExpensesService.createExpense failed", {
        userId,
        projectId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to create project expense");
    }

    return data as ProjectExpenseRow;
  }

  static async getExpense(
    userId: string,
    expenseId: string
  ): Promise<ProjectExpenseRow> {
    const { data, error } = await supabaseAdmin
      .from("project_expenses")
      .select("id, user_id, project_id, description, amount_cents, category, expense_date, created_at")
      .eq("id", expenseId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      logger.error("ProjectExpensesService.getExpense failed", {
        userId,
        expenseId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to load project expense");
    }

    if (!data) {
      throw new HttpError(404, "Project expense not found");
    }

    return data as ProjectExpenseRow;
  }

  static async updateExpense(
    userId: string,
    expenseId: string,
    input: unknown
  ): Promise<ProjectExpenseRow> {
    const parsed = UpdateExpenseSchema.safeParse(input);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid project expense payload");
    }

    await ProjectExpensesService.getExpense(userId, expenseId);

    const patch = parsed.data;

    const updatePayload: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (typeof patch.label === "string") {
      updatePayload.description = patch.label;
    }

    if (typeof patch.amount_cents === "number") {
      updatePayload.amount_cents = patch.amount_cents;
    }

    if (patch.occurred_at !== undefined) {
      updatePayload.expense_date = normalizeExpenseDate(patch.occurred_at);
    }

    if (patch.category !== undefined) {
      updatePayload.category = patch.category ?? "other";
    }

    const { data, error } = await supabaseAdmin
      .from("project_expenses")
      .update(updatePayload)
      .eq("id", expenseId)
      .eq("user_id", userId)
      .select("id, user_id, project_id, description, amount_cents, category, expense_date, created_at")
      .single();

    if (error) {
      logger.error("ProjectExpensesService.updateExpense failed", {
        userId,
        expenseId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to update project expense");
    }

    return data as ProjectExpenseRow;
  }

  static async deleteExpense(userId: string, expenseId: string): Promise<void> {
    await ProjectExpensesService.getExpense(userId, expenseId);

    const { error } = await supabaseAdmin
      .from("project_expenses")
      .delete()
      .eq("id", expenseId)
      .eq("user_id", userId);

    if (error) {
      logger.error("ProjectExpensesService.deleteExpense failed", {
        userId,
        expenseId,
        message: error.message,
      });
      throw new HttpError(500, "Failed to delete project expense");
    }
  }
}