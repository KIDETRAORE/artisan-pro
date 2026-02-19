/**
 * Rôles système
 */
export type UserRole = "user" | "admin";

/**
 * Permissions métier
 */
export const PERMISSIONS = {
  ACCESS_DASHBOARD: "access_dashboard",
  USE_VISION: "use_vision",
  MANAGE_USERS: "manage_users",
} as const;

/**
 * Type Permission strict
 */
export type Permission =
  typeof PERMISSIONS[keyof typeof PERMISSIONS];
