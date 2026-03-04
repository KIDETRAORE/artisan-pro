import { Router, type Request, type Response } from "express";
import { z } from "zod";

import { supabaseAdmin } from "../lib/supabaseAdmin";
import { sendError } from "../utils/apiError";

export const usageRouter = Router();

const DailyQuerySchema = z.object({
  days: z
    .string()
    .optional()
    .transform((v) => {
      const n = v ? Number(v) : 7;
      return Number.isFinite(n) && n > 0 ? Math.min(60, Math.floor(n)) : 7;
    }),
});

/**
 * GET /usage/daily?days=7
 * => IA utilisées par jour (count + tokens_estimated)
 */
usageRouter.get("/daily", async (req: Request, res: Response) => {
  if (!req.user?.id) {
    return sendError(req, res, 401, "unauthorized", "Non authentifié");
  }

  const parsed = DailyQuerySchema.safeParse(req.query);
  const days = parsed.success ? parsed.data.days : 7;

  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - (days - 1));
  from.setHours(0, 0, 0, 0);

  // On lit ai_usage (déjà alimentée dans quotaService.recordUsage)
  const { data, error } = await supabaseAdmin
    .from("ai_usage")
    .select("created_at, tokens_estimated")
    .eq("user_id", req.user.id)
    .gte("created_at", from.toISOString());

  if (error) {
    return sendError(req, res, 500, "usage_fetch_failed", error.message);
  }

  // Bucket par jour (YYYY-MM-DD)
  const buckets = new Map<string, { count: number; tokens: number }>();

  // init jours manquants
  for (let i = 0; i < days; i++) {
    const d = new Date(from);
    d.setDate(from.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    buckets.set(key, { count: 0, tokens: 0 });
  }

  for (const row of data ?? []) {
    const dt = new Date(row.created_at as string);
    const key = dt.toISOString().slice(0, 10);

    const prev = buckets.get(key) ?? { count: 0, tokens: 0 };
    const tok = Number((row as any).tokens_estimated ?? 0) || 0;

    buckets.set(key, {
      count: prev.count + 1,
      tokens: prev.tokens + tok,
    });
  }

  const daily = Array.from(buckets.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, v]) => ({ date, count: v.count, tokens: v.tokens }));

  const todayKey = new Date().toISOString().slice(0, 10);
  const today = buckets.get(todayKey) ?? { count: 0, tokens: 0 };

  return res.json({
    success: true,
    range: { from: from.toISOString(), days },
    today,
    daily,
  });
});