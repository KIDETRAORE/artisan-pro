import { Request, Response, NextFunction } from "express";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Non authentifié" });
      return;
    }

    const token = authHeader.replace("Bearer ", "");

    const { data, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !data?.user) {
      res.status(401).json({ message: "Token invalide" });
      return;
    }

    // 🔥 On injecte le user dans la requête
    (req as any).user = data.user;

    next();
  } catch (error) {
    res.status(401).json({ message: "Non authentifié" });
  }
};
