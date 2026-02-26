// src/auth/can.ts

import type { AuthUser, Permission } from "../api/auth.api";

/**
 * Vérifie si un utilisateur possède une permission donnée
 */
export function can(
  user: AuthUser | null,
  permission: Permission
): boolean {
  if (!user) return false;

  // Admin → accès total
  if (user.role === "admin") return true;

  if (!Array.isArray(user.permissions)) return false;

  return user.permissions.includes(permission);
}