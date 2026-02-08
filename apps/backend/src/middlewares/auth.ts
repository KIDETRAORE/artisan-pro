import { Request, Response, NextFunction } from "express";
import { verifyAccessToken } from "../lib/jwt";
import { authMiddleware } from '../middlewares/auth';

export function authMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Non autorisé" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const payload = verifyAccessToken(token);
    (req as any).user = payload;
    next();
  } catch {
    return res.status(401).json({ message: "Token invalide" });
  }
}

