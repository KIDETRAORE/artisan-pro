// apps/backend/src/controllers/projectExpenses.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../utils/httpError";
import { requireUser } from "../utils/requireUser";
import { ProjectsService } from "../services/projects.service";
import { ProjectExpensesService } from "../services/projectExpenses.service";

const ProjectIdSchema = z.string().uuid();
const ExpenseIdSchema = z.string().uuid();

export class ProjectExpensesController {
  /**
   * GET /projects/:projectId/expenses
   */
  static async list(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.projectId);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid projectId");
    }

    // ✅ Ownership check
    await ProjectsService.getProject(user.id, projectId.data);

    const expenses = await ProjectExpensesService.listExpenses(
      user.id,
      projectId.data
    );

    return res.status(200).json({
      success: true,
      expenses,
    });
  }

  /**
   * POST /projects/:projectId/expenses
   */
  static async create(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = ProjectIdSchema.safeParse(req.params.projectId);
    if (!projectId.success) {
      throw new HttpError(400, "Invalid projectId");
    }

    // ✅ Ownership check
    await ProjectsService.getProject(user.id, projectId.data);

    const expense = await ProjectExpensesService.createExpense(
      user.id,
      projectId.data,
      req.body
    );

    return res.status(201).json({
      success: true,
      expense,
    });
  }

  /**
   * PATCH /project-expenses/:expenseId
   */
  static async update(req: Request, res: Response) {
    const user = requireUser(req);

    const expenseId = ExpenseIdSchema.safeParse(req.params.expenseId);
    if (!expenseId.success) {
      throw new HttpError(400, "Invalid expenseId");
    }

    const expense = await ProjectExpensesService.updateExpense(
      user.id,
      expenseId.data,
      req.body
    );

    return res.status(200).json({
      success: true,
      expense,
    });
  }

  /**
   * DELETE /project-expenses/:expenseId
   */
  static async remove(req: Request, res: Response) {
    const user = requireUser(req);

    const expenseId = ExpenseIdSchema.safeParse(req.params.expenseId);
    if (!expenseId.success) {
      throw new HttpError(400, "Invalid expenseId");
    }

    await ProjectExpensesService.deleteExpense(user.id, expenseId.data);

    return res.status(200).json({
      success: true,
    });
  }
}