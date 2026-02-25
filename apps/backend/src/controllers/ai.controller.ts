import { Request, Response } from "express";
import pool from "../config/db";
import { runAI } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";
import { supabaseAdmin } from "../lib/supabaseAdmin";

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
    const userId = (req as any).user?.id;

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

    const invoices = result.rows;

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
    try {
      if (aiResponse.includes("{")) {
        const parsed = JSON.parse(aiResponse);
        advice = parsed.answer || aiResponse;
      }
    } catch (_e) {
      advice = aiResponse.replace(/```json|```/g, "").trim();
    }

    return res.json({ advice });
  } catch (error: any) {
    if (error?.statusCode === 403 && error?.payload) {
      return res.status(403).json(error.payload);
    }

    logger.error("❌ Erreur AI Strategy:", error?.message ?? String(error));
    return res.status(500).json({ error: "Erreur lors de l'analyse stratégique" });
  }
};

export const getAiForecast = async (req: Request, res: Response) => {
  try {
    const userId = (req as any).user?.id;

    const result = await pool.query(
      `SELECT SUM(total_amount) as total
       FROM invoices
       WHERE user_id = $1
       AND status = 'UNPAID'
       AND due_date <= NOW() + INTERVAL '30 days'`,
      [userId]
    );

    const expectedNext30Days = parseFloat(result.rows[0].total || "0");
    return res.json({ expectedNext30Days });
  } catch (error: any) {
    logger.error("❌ Erreur AI Forecast:", error?.message ?? String(error));
    return res.status(500).json({ error: "Erreur de calcul prévisionnel" });
  }
};