import { Request } from "express";

/**
 * Request garanti authentifié
 * À utiliser UNIQUEMENT sur routes protégées par authMiddleware
 */
export interface AuthenticatedRequest extends Request {
  user: Express.AuthUser; // correspond à ton express.d.ts
}
