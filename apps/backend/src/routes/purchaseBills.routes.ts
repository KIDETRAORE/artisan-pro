// apps/backend/src/routes/purchaseBills.routes.ts
import { Router } from "express";
import { z } from "zod";
import { authMiddleware } from "@middlewares/auth.middleware";
import { PurchaseBillsService } from "../services/purchaseBills.service";
import { HttpError } from "../utils/httpError";

const router = Router();

const PurchaseBillIdParamsSchema = z.object({
  purchaseBillId: z.string().uuid(),
});

const CreatePurchaseBillBodySchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  bill_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  subtotal_cents: z.number().int().nonnegative().nullable().optional(),
  tax_cents: z.number().int().nonnegative().nullable().optional(),
  total_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: z
    .enum(["draft", "posted", "paid", "overdue", "canceled"])
    .default("draft"),
  source_system: z
    .enum(["artisanpro", "pennylane", "odoo", "file_import", "manual"])
    .nullable()
    .optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: z.enum(["manual", "compta_import"]).default("manual"),
});

const UpdatePurchaseBillBodySchema = z.object({
  contact_id: z.string().uuid().nullable().optional(),
  project_id: z.string().uuid().nullable().optional(),
  bill_number: z.string().trim().min(1).nullable().optional(),
  issue_date: z.string().trim().min(1).nullable().optional(),
  due_date: z.string().trim().min(1).nullable().optional(),
  subtotal_cents: z.number().int().nonnegative().nullable().optional(),
  tax_cents: z.number().int().nonnegative().nullable().optional(),
  total_cents: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().trim().min(1).nullable().optional(),
  status: z.enum(["draft", "posted", "paid", "overdue", "canceled"]).optional(),
  source_system: z
    .enum(["artisanpro", "pennylane", "odoo", "file_import", "manual"])
    .nullable()
    .optional(),
  source_external_id: z.string().trim().min(1).nullable().optional(),
  origin_type: z.enum(["manual", "compta_import"]).optional(),
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

    const items = await PurchaseBillsService.listPurchaseBills(userId);

    res.json({
      success: true,
      data: items,
    });
  } catch (error) {
    next(error);
  }
});

router.get("/:purchaseBillId", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { purchaseBillId } = PurchaseBillIdParamsSchema.parse(req.params);

    const item = await PurchaseBillsService.getPurchaseBill(
      userId,
      purchaseBillId
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
    const body = CreatePurchaseBillBodySchema.parse(req.body);

    const item = await PurchaseBillsService.createPurchaseBill(userId, body);

    res.status(201).json({
      success: true,
      data: item,
    });
  } catch (error) {
    next(error);
  }
});

router.patch("/:purchaseBillId", authMiddleware, async (req, res, next) => {
  try {
    const userId = getUserId(req);
    const { purchaseBillId } = PurchaseBillIdParamsSchema.parse(req.params);
    const body = UpdatePurchaseBillBodySchema.parse(req.body);

    const item = await PurchaseBillsService.updatePurchaseBill(
      userId,
      purchaseBillId,
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