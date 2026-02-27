// src/auth/can.ts

import type { AuthUser, Permission } from "../api/auth.api";

/**
 * Vérifie si un utilisateur possède une permission donnée
 *
 * @param user AuthUser | null
 * @param permission Permission
 * @returns boolean
 */
export function can(
  user: AuthUser | null,
  permission: Permission
): boolean {
  if (!user) return false;

  if (!Array.isArray(user.permissions)) return false;

  return user.permissions.includes(permission);
}
