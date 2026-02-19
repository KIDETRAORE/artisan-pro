import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../config/env";

const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);

export const quotaMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    // 🔎 Récupération du profil
    const { data: profile, error } = await supabase
      .from("profiles")
      .select("quota_reset_at")
      .eq("id", user.id)
      .single();

    if (error || !profile) {
      return res.status(404).json({ message: "User not found" });
    }

    const now = Math.floor(Date.now() / 1000);

    // 🔄 Reset automatique si période dépassée
    if (profile.quota_reset_at && now > profile.quota_reset_at) {
      await supabase
        .from("profiles")
        .update({
          monthly_quota_used: 0,
          quota_reset_at: null, // sera remis à jour par Stripe
        })
        .eq("id", user.id);
    }

    // 🛡 Incrément atomique sécurisé via RPC SQL
    const { data: allowed, error: rpcError } = await supabase.rpc(
      "increment_quota_if_allowed",
      { user_id: user.id }
    );

    if (rpcError) {
      console.error("RPC quota error:", rpcError);
      return res.status(500).json({ message: "Quota check failed" });
    }

    if (!allowed) {
      return res.status(403).json({
        message: "Monthly quota exceeded",
      });
    }

    next();
  } catch (err) {
    console.error("Quota middleware error:", err);
    return res.status(500).json({
      message: "Quota check failed",
    });
  }
};
