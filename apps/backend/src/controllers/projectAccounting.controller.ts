// apps/backend/src/controllers/projectAccounting.controller.ts
import type { Request, Response } from "express";
import * as XLSX from "xlsx";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { requireUser } from "../utils/requireUser";
import { HttpError } from "../utils/httpError";
import { ProjectsService } from "../services/projects.service";

// ✅ Mapping compte comptable → catégorie
function mapAccountToCategory(
  account: string
): "materials" | "labor" | "equipment" | "transport" | "other" {
  if (
    account.startsWith("601") ||
    account.startsWith("602") ||
    account.startsWith("606")
  ) {
    return "materials";
  }

  if (account.startsWith("604")) {
    return "labor";
  }

  if (
    account.startsWith("615") ||
    account.startsWith("612") ||
    account.startsWith("613")
  ) {
    return "equipment";
  }

  if (account.startsWith("624") || account.startsWith("625")) {
    return "transport";
  }

  return "other";
}

// ✅ Conversion date fichier comptable -> YYYY-MM-DD
function normalizeExpenseDate(value: unknown): string | null {
  if (value == null || value === "") return null;

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return null;

    const year = String(parsed.y).padStart(4, "0");
    const month = String(parsed.m).padStart(2, "0");
    const day = String(parsed.d).padStart(2, "0");

    return `${year}-${month}-${day}`;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoMatch) {
      return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
    }

    const frMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (frMatch) {
      return `${frMatch[3]}-${frMatch[2]}-${frMatch[1]}`;
    }

    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString().slice(0, 10);
    }
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  return null;
}

export class ProjectAccountingController {
  static async importAccountingFile(req: Request, res: Response) {
    const user = requireUser(req);

    const projectId = String(req.params.projectId ?? "");
    if (!projectId) {
      throw new HttpError(400, "Invalid projectId");
    }

    // ✅ Ownership / existence check
    await ProjectsService.getProject(user.id, projectId);

    if (!req.file) {
      throw new HttpError(400, "File missing");
    }

    const workbook = XLSX.read(req.file.buffer, {
      type: "buffer",
      cellDates: true,
    });

    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new HttpError(400, "Empty workbook");
    }

    const sheet = workbook.Sheets[firstSheetName];
    if (!sheet) {
      throw new HttpError(400, "Invalid sheet");
    }

    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      raw: false,
    });

    const expenses: Array<{
      user_id: string;
      project_id: string;
      description: string;
      amount_cents: number;
      category: "materials" | "labor" | "equipment" | "transport" | "other";
      expense_date: string | null;
    }> = [];

    for (const row of rows) {
      const account = String(row["Compte"] ?? "").trim();
      const label = String(row["Libellé"] ?? "").trim();
      const debit = Number(row["Débit (€)"] ?? 0);
      const expenseDate = normalizeExpenseDate(row["Date"]);

      if (!account.startsWith("6")) continue;
      if (!debit || debit <= 0) continue;
      if (!label) continue;

      const category = mapAccountToCategory(account);

      expenses.push({
        user_id: user.id,
        project_id: projectId,
        description: label,
        amount_cents: Math.round(debit * 100),
        category,
        expense_date: expenseDate,
      });
    }

    if (expenses.length === 0) {
      return res.json({
        success: true,
        imported: 0,
      });
    }

    const { error } = await supabaseAdmin
      .from("project_expenses")
      .insert(expenses);

    if (error) {
      throw new HttpError(500, error.message);
    }

    return res.json({
      success: true,
      imported: expenses.length,
    });
  }
}