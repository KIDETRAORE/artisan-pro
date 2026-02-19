import { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";
import { ENV } from "../config/env";

const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);

export const checkQuota = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const user = (req as any).user;

  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  // 1️⃣ Get user plan
  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ message: "User not found" });
  }

  if (profile.plan === "PRO") {
    return next(); // unlimited
  }

  // 2️⃣ Calculate current month range
  const now = new Date();
  const firstDayOfMonth = new Date(
    now.getFullYear(),
    now.getMonth(),
    1
  ).toISOString();

  // 3️⃣ Count analyses
  const { count, error: countError } = await supabase
    .from("analyses")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", firstDayOfMonth);

  if (countError) {
    return res.status(500).json({ message: "Quota check failed" });
  }

  if ((count ?? 0) >= 3) {
    return res.status(403).json({
      message: "Free plan quota exceeded. Upgrade to Pro."
    });
  }

  next();
};
