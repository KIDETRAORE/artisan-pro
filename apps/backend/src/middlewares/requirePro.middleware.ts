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
  const user = (req as any).user;

  if (!user?.id) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { data, error } = await supabase
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .single();

  if (error || !data) {
    return res.status(403).json({ message: "User not found" });
  }

  if (data.plan !== "PRO") {
    return res.status(403).json({ message: "Pro subscription required" });
  }

  next();
};
