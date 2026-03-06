// apps/backend/src/controllers/integrations.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { requireUser } from "../utils/requireUser";
import { HttpError } from "../utils/httpError";
import { IntegrationsService } from "../services/integrations.service";
import { integrationQueue } from "../queues/integration.queue";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const ConnectPennylaneSchema = z.object({
  apiKey: z.string().min(1),
});

const SyncEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

const InvoiceParamsSchema = z.object({
  invoiceId: z.string().uuid(),
});

export class IntegrationsController {
  static async pennylaneStatus(req: Request, res: Response) {
    const user = requireUser(req);

    const query = SyncEventsQuerySchema.safeParse(req.query);
    if (!query.success) {
      throw new HttpError(400, "Invalid query params");
    }

    const connection = await IntegrationsService.getPennylaneStatus(user.id);
    const recentEvents = await IntegrationsService.getPennylaneSyncEvents(
      user.id,
      query.data.limit
    );

    return res.status(200).json({
      success: true,
      provider: "pennylane",
      connection,
      recentEvents,
    });
  }

  static async connectPennylane(req: Request, res: Response) {
    const user = requireUser(req);

    const parsed = ConnectPennylaneSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid Pennylane payload");
    }

    const connection = await IntegrationsService.connectPennylane(
      user.id,
      parsed.data.apiKey
    );

    return res.status(200).json({
      success: true,
      provider: "pennylane",
      connection,
    });
  }

  static async disconnectPennylane(req: Request, res: Response) {
    const user = requireUser(req);

    await IntegrationsService.disconnectPennylane(user.id);

    return res.status(200).json({
      success: true,
      provider: "pennylane",
    });
  }

  static async resyncPennylaneInvoice(req: Request, res: Response) {
    const user = requireUser(req);

    const parsed = InvoiceParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const { invoiceId } = parsed.data;

    await integrationQueue.add("push_invoice", {
      type: "push_invoice",
      userId: user.id,
      invoiceId,
      provider: "pennylane",
    });

    return res.status(200).json({
      success: true,
      provider: "pennylane",
      invoiceId,
      message: "Resync job enqueued",
    });
  }

  static async getPennylaneInvoiceSyncEvents(req: Request, res: Response) {
    const user = requireUser(req);

    const parsed = InvoiceParamsSchema.safeParse(req.params);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid invoiceId");
    }

    const { invoiceId } = parsed.data;

    const { data, error } = await supabaseAdmin
      .from("sync_events")
      .select("id, status, message, created_at")
      .eq("user_id", user.id)
      .eq("provider", "pennylane")
      .eq("object_type", "invoice")
      .eq("object_id", invoiceId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      throw new HttpError(500, "Failed to load sync events");
    }

    return res.status(200).json({
      success: true,
      events: data ?? [],
    });
  }
}