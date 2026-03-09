// src/auth/useCan.ts

import { useAuth } from "../store/auth.store";
import type { Permission } from "../api/auth.api";

/**
 * Hook de gestion des permissions
 *
 * Usage:
 * const can = useCan();
 * can("delete_user") -> boolean
 *
 * OU
 * const canDelete = useCan("delete_user");
 */
export function useCan(permission?: Permission) {
  const { user } = useAuth();

  /**
   * Aucun utilisateur connecté
   */
  if (!user) {
    return permission ? false : () => false;
  }

  /**
   * Admin → accès total
   */
  if (user.role === "admin") {
    return permission ? true : () => true;
  }

  /**
   * Vérification permission fine
   */
  const hasPermission = (perm: Permission) => {
    return user.permissions.includes(perm);
  };

  return permission ? hasPermission(permission) : hasPermission;
}
