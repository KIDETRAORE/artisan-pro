import type { Request, Response } from "express";
import pool from "../config/db";
import { runAI } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";

function getUserId(req: Request): string | null {
  const userId = (req as any).user?.id as string | undefined;
  return userId && typeof userId === "string" ? userId : null;
}

async function consumeAiQuotaOrThrow(userId: string, amt = 1) {
  const { data, error } = await supabaseAdmin.rpc("consume_ai_quota", {
    uid: userId,
    amt,
  });

  if (error) throw error;

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) {
    const used = row?.used ?? 0;
    const limit = row?.monthly_limit ?? 0;
    const resetAt = row?.reset_at ?? null;

    const err: any = new Error("Quota exceeded");
    err.statusCode = 403;
    err.payload = {
      success: false,
      error: "Quota mensuel IA dépassé. Passez au plan PRO.",
      usage: used,
      limit,
      reset_at: resetAt,
    };
    throw err;
  }
}

export const getAiStrategy = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    const result = await pool.query(
      `SELECT client_name, total_amount, due_date
       FROM invoices
       WHERE user_id = $1 AND status = 'UNPAID'
       ORDER BY due_date ASC LIMIT 10`,
      [userId]
    );

    const invoices = result.rows ?? [];

    if (invoices.length === 0) {
      return res.json({
        advice:
          "Toutes vos factures sont payées. Votre situation est excellente !",
      });
    }

    const prompt = `Analyse ma situation de trésorerie avec ces factures impayées : ${JSON.stringify(
      invoices
    )}.
Donne-moi 2-3 conseils stratégiques très courts pour un artisan.`;

    const aiResponse = await runAI("relance", { prompt, userId });

    // ✅ Consommer 1 crédit uniquement si l'appel IA a réussi
    await consumeAiQuotaOrThrow(userId, 1);

    let advice = aiResponse;

    // Parse best-effort sans casser la réponse
    try {
      const cleaned = aiResponse.replace(/```json|```/g, "").trim();
      if (cleaned.startsWith("{") || cleaned.startsWith("[")) {
        const parsed = JSON.parse(cleaned);
        advice =
          (parsed && typeof parsed === "object" && (parsed as any).answer) ||
          aiResponse;
      } else {
        advice = cleaned;
      }
    } catch {
      advice = aiResponse.replace(/```json|```/g, "").trim();
    }

    return res.json({ advice });
  } catch (error: unknown) {
    // Quota exceeded (payload safe)
    if (
      typeof error === "object" &&
      error !== null &&
      (error as any).statusCode === 403 &&
      (error as any).payload
    ) {
      return res.status(403).json((error as any).payload);
    }

    const message = error instanceof Error ? error.message : String(error);
    logger.error("[AI] Strategy failed", { message });

    return res
      .status(500)
      .json({ error: "Erreur lors de l'analyse stratégique" });
  }
};

export const getAiForecast = async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      return res.status(401).json({ error: "Utilisateur non identifié" });
    }

    const result = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) as total
       FROM invoices
       WHERE user_id = $1
         AND status = 'UNPAID'
         AND due_date <= NOW() + INTERVAL '30 days'`,
      [userId]
    );

    const expectedNext30Days = Number(result.rows?.[0]?.total ?? 0);

    return res.json({ expectedNext30Days });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("[AI] Forecast failed", { message });

    return res.status(500).json({ error: "Erreur de calcul prévisionnel" });
  }
};