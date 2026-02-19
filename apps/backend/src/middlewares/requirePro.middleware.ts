import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../config/env";

const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);

export const requirePro = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = (req as any).user;

    if (!user?.id) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("plan, subscription_status, current_period_end")
      .eq("id", user.id)
      .single();

    if (error || !data) {
      return res.status(404).json({ message: "User profile not found" });
    }

    const now = Math.floor(Date.now() / 1000);

    // 🔒 Sécurité SaaS complète
    if (
      data.plan !== "PRO" ||
      data.subscription_status !== "active" ||
      (data.current_period_end &&
        data.current_period_end < now)
    ) {
      return res.status(403).json({
        message: "Active Pro subscription required",
      });
    }

    next();
  } catch (err) {
    console.error("requirePro error:", err);
    return res.status(500).json({
      message: "Subscription check failed",
    });
  }
};
