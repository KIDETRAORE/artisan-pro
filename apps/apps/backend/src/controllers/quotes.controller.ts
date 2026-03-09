// apps/backend/src/controllers/quotes.controller.ts
import { Request, Response } from "express";
import { sendError } from "../utils/apiError";
import {
  listQuotes,
  listPendingQuotes,
  createQuote,
  updateQuoteStatus,
  convertQuoteToInvoice,
} from "../services/quotes.service";

export async function getQuotes(req: Request, res: Response) {
  const userId = req.user?.id;

  if (!userId) {
    return sendError(req, res, 401, "unauthorized", "Unauthorized");
  }

  try {
    const quotes = await listQuotes(userId);
    return res.json(quotes);
  } catch {
    return sendError(
      req,
      res,
      500,
      "quotes_fetch_failed",
      "Failed to fetch quotes"
    );
  }
}

export async function getPendingQuotes(req: Request, res: Response) {
  const userId = req.user?.id;

  if (!userId) {
    return sendError(req, res, 401, "unauthorized", "Unauthorized");
  }

  try {
    const quotes = await listPendingQuotes(userId);
    return res.json(quotes);
  } catch {
    return sendError(
      req,
      res,
      500,
      "pending_quotes_fetch_failed",
      "Failed to fetch pending quotes"
    );
  }
}

export async function postQuote(req: Request, res: Response) {
  const userId = req.user?.id;

  if (!userId) {
    return sendError(req, res, 401, "unauthorized", "Unauthorized");
  }

  try {
    const quote = await createQuote(userId, req.body);
    return res.status(201).json(quote);
  } catch {
    return sendError(
      req,
      res,
      500,
      "quote_create_failed",
      "Failed to create quote"
    );
  }
}

export async function patchQuoteStatus(req: Request, res: Response) {
  const rawId = req.params.id;
  const { status } = req.body;

  const id = typeof rawId === "string" ? rawId : undefined;

  if (!id) {
    return sendError(req, res, 400, "invalid_quote_id", "Invalid quote id");
  }

  if (typeof status !== "string" || !status.trim()) {
    return sendError(
      req,
      res,
      400,
      "invalid_quote_status",
      "Invalid quote status"
    );
  }

  try {
    await updateQuoteStatus(id, status);
    return res.json({ success: true });
  } catch {
    return sendError(
      req,
      res,
      500,
      "quote_status_update_failed",
      "Failed to update quote status"
    );
  }
}

export async function postConvertQuote(req: Request, res: Response) {
  const userId = req.user?.id;
  const rawId = req.params.id;

  if (!userId) {
    return sendError(req, res, 401, "unauthorized", "Unauthorized");
  }

  const id = typeof rawId === "string" ? rawId : undefined;

  if (!id) {
    return sendError(req, res, 400, "invalid_quote_id", "Invalid quote id");
  }

  try {
    const result = await convertQuoteToInvoice(userId, id);

    return res.status(201).json({
      success: true,
      quote: result.quote,
      invoice: result.invoice,
    });
  } catch {
    return sendError(
      req,
      res,
      500,
      "quote_convert_failed",
      "Failed to convert quote"
    );
  }
}