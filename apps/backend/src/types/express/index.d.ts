import "express-serve-static-core";
import type { UserRole, Permission } from "../../src/auth/permissions.js";

declare module "express-serve-static-core" {
  interface AuthUser {
    id: string;
    email: string;
    role: UserRole;
    permissions: Permission[];
    stripePlan?: string | null;
  }

  interface Request {
    user?: AuthUser;
  }
}

export {};
