import { Request, Response } from "express";
import pool from "../config/db";
import { runAI } from "../services/ai/gemini.service";
import { logger } from "../utils/logger";

export const getAiStrategy = async (req: Request, res: Response) => {
  try {
    // Utilisation de authMiddleware (req.user est injecté)
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
      return res.json({ advice: "Toutes vos factures sont payées. Votre situation est excellente !" });
    }

    const prompt = `Analyse ma situation de trésorerie avec ces factures impayées : ${JSON.stringify(invoices)}. 
    Donne-moi 2-3 conseils stratégiques très courts pour un artisan.`;

    // Utilisation du service existant
    const aiResponse = await runAI("relance", { prompt, userId });

    let advice = aiResponse;
    try {
      if (aiResponse.includes("{")) {
        const parsed = JSON.parse(aiResponse);
        advice = parsed.answer || aiResponse;
      }
    } catch (e) {
      advice = aiResponse.replace(/```json|```/g, "").trim();
    }

    res.json({ advice });
  } catch (error: any) {
    logger.error("❌ Erreur AI Strategy:", error.message);
    res.status(500).json({ error: "Erreur lors de l'analyse stratégique" });
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
    res.json({ expectedNext30Days });
  } catch (error: any) {
    logger.error("❌ Erreur AI Forecast:", error.message);
    res.status(500).json({ error: "Erreur de calcul prévisionnel" });
  }
};