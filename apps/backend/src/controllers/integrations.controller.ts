// apps/backend/src/controllers/integrations.controller.ts
import type { Request, Response } from "express";
import { z } from "zod";
import { requireUser } from "../utils/requireUser";
import { HttpError } from "../utils/httpError";
import { IntegrationsService } from "../services/integrations.service";
import {
  enqueuePushInvoiceJob,
  enqueueSyncAccountingJob,
} from "../queues/integration.queue";
import { supabaseAdmin } from "../lib/supabaseAdmin";

const ConnectPennylaneSchema = z.object({
  apiKey: z.string().min(1),
});

const ConnectOdooSchema = z.object({
  baseUrl: z.string().min(1),
  database: z.string().min(1),
  login: z.string().min(1),
  apiKey: z.string().min(1),
});

const SyncEventsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).optional().default(10),
});

const InvoiceParamsSchema = z.object({
  invoiceId: z.string().uuid(),
});

const ProviderParamsSchema = z.object({
  provider: z.enum(["pennylane", "odoo"]),
});

type SupportedProvider = z.infer<typeof ProviderParamsSchema>["provider"];

async function assertSalesInvoiceOwnership(
  userId: string,
  invoiceId: string
): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("sales_invoices")
    .select("id, user_id")
    .eq("id", invoiceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    throw new HttpError(500, "Failed to load invoice");
  }

  if (!data) {
    throw new HttpError(404, "Invoice not found");
  }
}

async function getInvoiceSyncEvents(params: {
  userId: string;
  provider: SupportedProvider;
  invoiceId: string;
}) {
  const { data, error } = await supabaseAdmin
    .from("sync_events")
    .select("id, status, message, created_at")
    .eq("user_id", params.userId)
    .eq("provider", params.provider)
    .eq("object_type", "invoice")
    .eq("object_id", params.invoiceId)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    throw new HttpError(500, "Failed to load sync events");
  }

  return data ?? [];
}

async function getProviderStatus(
  userId: string,
  provider: SupportedProvider,
  limit: number
) {
  if (provider === "pennylane") {
    const connection = await IntegrationsService.getPennylaneStatus(userId);
    const recentEvents = await IntegrationsService.getPennylaneSyncEvents(
      userId,
      limit
    );

    return { connection, recentEvents };
  }

  const connection = await IntegrationsService.getOdooStatus(userId);
  const recentEvents = await IntegrationsService.getOdooSyncEvents(
    userId,
    limit
  );

  return { connection, recentEvents };
}

async function disconnectProvider(
  userId: string,
  provider: SupportedProvider
): Promise<void> {
  if (provider === "pennylane") {
    await IntegrationsService.disconnectPennylane(userId);
    return;
  }

  await IntegrationsService.disconnectOdoo(userId);
}

async function enqueueProviderSync(params: {
  userId: string;
  provider: SupportedProvider;
}): Promise<void> {
  await enqueueSyncAccountingJob({
    userId: params.userId,
    provider: params.provider,
  });
}

function parseInvoiceId(params: unknown): string {
  const parsed = InvoiceParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid invoiceId");
  }

  return parsed.data.invoiceId;
}

function parseProvider(params: unknown): SupportedProvider {
  const parsed = ProviderParamsSchema.safeParse(params);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid provider");
  }

  return parsed.data.provider;
}

function parseSyncLimit(query: unknown): number {
  const parsed = SyncEventsQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new HttpError(400, "Invalid query params");
  }

  return parsed.data.limit;
}

export class IntegrationsController {
  static async pennylaneStatus(req: Request, res: Response) {
    const user = requireUser(req);
    const limit = parseSyncLimit(req.query);

    const connection = await IntegrationsService.getPennylaneStatus(user.id);
    const recentEvents = await IntegrationsService.getPennylaneSyncEvents(
      user.id,
      limit
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

  static async syncPennylane(req: Request, res: Response) {
    const user = requireUser(req);

    await enqueueProviderSync({
      userId: user.id,
      provider: "pennylane",
    });

    return res.status(200).json({
      success: true,
      provider: "pennylane",
      message: "Sync job enqueued",
    });
  }

  static async resyncPennylaneInvoice(req: Request, res: Response) {
    const user = requireUser(req);
    const invoiceId = parseInvoiceId(req.params);

    await assertSalesInvoiceOwnership(user.id, invoiceId);

    await enqueuePushInvoiceJob({
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
    const invoiceId = parseInvoiceId(req.params);

    await assertSalesInvoiceOwnership(user.id, invoiceId);

    const events = await getInvoiceSyncEvents({
      userId: user.id,
      provider: "pennylane",
      invoiceId,
    });

    return res.status(200).json({
      success: true,
      events,
    });
  }

  static async odooStatus(req: Request, res: Response) {
    const user = requireUser(req);
    const limit = parseSyncLimit(req.query);

    const connection = await IntegrationsService.getOdooStatus(user.id);
    const recentEvents = await IntegrationsService.getOdooSyncEvents(
      user.id,
      limit
    );

    return res.status(200).json({
      success: true,
      provider: "odoo",
      connection,
      recentEvents,
    });
  }

  static async connectOdoo(req: Request, res: Response) {
    const user = requireUser(req);

    const parsed = ConnectOdooSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new HttpError(400, "Invalid Odoo payload");
    }

    const connection = await IntegrationsService.connectOdoo(user.id, {
      baseUrl: parsed.data.baseUrl,
      database: parsed.data.database,
      login: parsed.data.login,
      apiKey: parsed.data.apiKey,
    });

    await enqueueProviderSync({
      userId: user.id,
      provider: "odoo",
    });

    return res.status(200).json({
      success: true,
      provider: "odoo",
      connection,
      message: "Odoo connected and sync job enqueued",
    });
  }

  static async disconnectOdoo(req: Request, res: Response) {
    const user = requireUser(req);

    await IntegrationsService.disconnectOdoo(user.id);

    return res.status(200).json({
      success: true,
      provider: "odoo",
    });
  }

  static async syncOdoo(req: Request, res: Response) {
    const user = requireUser(req);

    await enqueueProviderSync({
      userId: user.id,
      provider: "odoo",
    });

    return res.status(200).json({
      success: true,
      provider: "odoo",
      message: "Sync job enqueued",
    });
  }

  static async resyncOdooInvoice(req: Request, res: Response) {
    const user = requireUser(req);
    const invoiceId = parseInvoiceId(req.params);

    await assertSalesInvoiceOwnership(user.id, invoiceId);

    await enqueueProviderSync({
      userId: user.id,
      provider: "odoo",
    });

    return res.status(200).json({
      success: true,
      provider: "odoo",
      invoiceId,
      message: "Resync job enqueued",
    });
  }

  static async getOdooInvoiceSyncEvents(req: Request, res: Response) {
    const user = requireUser(req);
    const invoiceId = parseInvoiceId(req.params);

    await assertSalesInvoiceOwnership(user.id, invoiceId);

    const events = await getInvoiceSyncEvents({
      userId: user.id,
      provider: "odoo",
      invoiceId,
    });

    return res.status(200).json({
      success: true,
      events,
    });
  }

  static async syncAccountingProvider(req: Request, res: Response) {
    const user = requireUser(req);
    const provider = parseProvider(req.params);

    await enqueueProviderSync({
      userId: user.id,
      provider,
    });

    return res.status(200).json({
      success: true,
      provider,
      message: "Sync job enqueued",
    });
  }

  static async getAccountingProviderStatus(req: Request, res: Response) {
    const user = requireUser(req);
    const provider = parseProvider(req.params);
    const limit = parseSyncLimit(req.query);

    const { connection, recentEvents } = await getProviderStatus(
      user.id,
      provider,
      limit
    );

    return res.status(200).json({
      success: true,
      provider,
      connection,
      recentEvents,
    });
  }

  static async disconnectAccountingProvider(req: Request, res: Response) {
    const user = requireUser(req);
    const provider = parseProvider(req.params);

    await disconnectProvider(user.id, provider);

    return res.status(200).json({
      success: true,
      provider,
    });
  }
}