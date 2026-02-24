import type { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export const checkQuota = async (req: Request, res: Response, next: NextFunction) => {
  const userId = req.user?.id;
  if (!userId) return res.status(401).json({ success: false, error: "Unauthorized" });

  // 1) Source de vérité: subscriptions
  const { data: sub, error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .select("plan,status")
    .eq("user_id", userId)
    .maybeSingle();

  // Si pas de ligne => FREE par défaut
  const plan = (sub?.plan ?? "free").toLowerCase();
  const status = (sub?.status ?? "inactive").toLowerCase();

  // Si PRO + actif => unlimited (ou quota élevé)
  if (plan === "pro" && (status === "active" || status === "trialing")) {
    return next();
  }

  // 2) Fenêtre mois courant
  const now = new Date();
  const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  // 3) Compte des analyses vision (FREE: 3/mois)
  const { count, error: countErr } = await supabaseAdmin
    .from("vision_analyses")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", firstDayOfMonth);

  if (countErr) return res.status(500).json({ success: false, error: "Quota check failed" });

  if ((count ?? 0) >= 3) {
    return res.status(403).json({
      success: false,
      error: "Free plan quota exceeded. Upgrade to Pro.",
    });
  }

  return next();
};