import "express";
import { Permission } from "../auth/permissions";

/**
 * ======================
 * EXPRESS REQUEST EXTENSION
 * ======================
 * Aligné avec :
 * - JwtUserPayload
 * - auth.middleware.ts
 * - requireRole
 * - can("permission")
 */
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        role: "user" | "admin";
        permissions: Permission[];
        tokenVersion: number;
      };
    }
  }
}

export {};
