// apps/backend/src/services/projectExpenses.service.ts
import { z } from "zod";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { HttpError } from "../utils/httpError";
import { logger } from "../utils/logger";

export type ProjectExpenseRow = {
  id: string;
  user_id: string;
  project_id: string;
  label: string;
  amount_cents: number;
  vendor: string | null;
  occurred_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const CreateExpenseSchema = z.object({
  label: z.string().min(1),
  amount_cents: z.number().int().nonnegative(),
  vendor: z.string().optional().nullable(),
  occurred_at: z.string().optional().nullable(), // ISO
});

const UpdateExpenseSchema = z.object({
  label: z.string().min(1).optional(),
  amount_cents: z.number().int().nonnegative().optional(),
  vendor: z.string().optional().nullable(),
  occurred_at: z.string().optional().nullable(),
});

export class ProjectExpensesService {
  static async listExpenses(
    userId: string,
    projectId: string
  ): Promise<ProjectExpenseRow[]> {
    const { data, error } = await supabaseAdmin
      .from("project_expenses")
      .select("*")
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
        label: payload.label,
        amount_cents: payload.amount_cents,
        vendor: payload.vendor ?? null,
        occurred_at: payload.occurred_at ?? null,
      })
      .select("*")
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
      .select("*")
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

    // ✅ Ownership check
    await ProjectExpensesService.getExpense(userId, expenseId);

    const patch = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("project_expenses")
      .update({
        ...patch,
        updated_at: new Date().toISOString(),
      })
      .eq("id", expenseId)
      .eq("user_id", userId)
      .select("*")
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
    // ✅ Ownership check
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