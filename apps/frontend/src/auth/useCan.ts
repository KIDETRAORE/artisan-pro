// src/auth/useCan.ts

import { useAuth } from "../store/auth.store";
import type { Permission } from "../api/auth.api";
import { can as canFn } from "./can";

/**
 * Hook de gestion des permissions
 *
 * Usage:
 * const can = useCan();
 * can("devis:write") -> boolean
 *
 * OU
 * const canEdit = useCan("devis:write");
 */

// 🔹 Overloads
export function useCan(): (permission: Permission) => boolean;
export function useCan(permission: Permission): boolean;

// 🔹 Implémentation
export function useCan(permission?: Permission) {
  const { user } = useAuth();

  // Aucun utilisateur connecté
  if (!user) {
    return permission
      ? false
      : (_perm: Permission) => false;
  }

  /**
   * ⚠️ IMPORTANT
   * On NE fait PAS user.role === "admin" directement
   * car AuthUser ne garantit pas la propriété role
   *
   * L’admin est traité via la permission spéciale "admin"
   */

  const isAdmin = canFn(user, "admin");

  if (isAdmin) {
    return permission
      ? true
      : (_perm: Permission) => true;
  }

  const hasPermission = (perm: Permission) => canFn(user, perm);

  return permission
    ? hasPermission(permission)
    : hasPermission;
}