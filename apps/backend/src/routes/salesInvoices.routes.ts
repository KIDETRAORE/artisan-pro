// apps/backend/src/routes/salesInvoices.routes.ts

import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "@middlewares/auth.middleware";
import { SalesInvoicesService } from "../services/salesInvoices.service";
import { HttpError } from "../utils/httpError";

const router = Router();

const SalesInvoiceIdParamsSchema = z.object({
  salesInvoiceId: z.string().uuid(),
});

const CreateSalesInvoiceBodySchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  total_amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: z
    .enum(["draft", "sent", "paid", "partial", "overdue", "cancelled"])
    .default("sent"),
  source_system: z
    .enum(["artisanpro", "pennylane", "odoo", "file_import", "manual"])
    .nullable()
    .optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: z
    .enum(["manual", "artisanpro", "compta_import", "sync"])
    .default("manual"),
});

const UpdateSalesInvoiceBodySchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  invoice_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  total_amount_cents: z.number().int().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: z
    .enum(["draft", "sent", "paid", "partial", "overdue", "cancelled"])
    .optional(),
  source_system: z
    .enum(["artisanpro", "pennylane", "odoo", "file_import", "manual"])
    .nullable()
    .optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: z
    .enum(["manual", "artisanpro", "compta_import", "sync"])
    .optional(),
});

function getUserId(req: {
  user?: {
    id?: string;
  };
}): string {
  const userId = req.user?.id;

  if (!userId) {
    throw new HttpError(401, "Unauthorized");
  }

  return userId;
}

router.get("/", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);

    const items = await SalesInvoicesService.listSalesInvoices(userId);

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:salesInvoiceId", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { salesInvoiceId } = SalesInvoiceIdParamsSchema.parse(req.params);

    const item = await SalesInvoicesService.getSalesInvoice(
      userId,
      salesInvoiceId
    );

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

router.post("/", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const body = CreateSalesInvoiceBodySchema.parse(req.body);

    const item = await SalesInvoicesService.createSalesInvoice(userId, body);

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:salesInvoiceId", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { salesInvoiceId } = SalesInvoiceIdParamsSchema.parse(req.params);
    const body = UpdateSalesInvoiceBodySchema.parse(req.body);

    const item = await SalesInvoicesService.updateSalesInvoice(
      userId,
      salesInvoiceId,
      body
    );

    res.json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

export default router;