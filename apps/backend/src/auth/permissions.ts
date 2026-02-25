/**
 * Rôles système / business
 */
export type UserRole = "user" | "admin" | "free" | "pro";

/**
 * Permissions métier (naming stable)
 */
export const PERMISSIONS = {
  ACCESS_DASHBOARD: "dashboard:read",
  DEVIS_READ: "devis:read",
  DEVIS_WRITE: "devis:write",
  AI_USE: "ai:use",
  AUTOMATION_USE: "automation:use",
  MANAGE_USERS: "users:manage",

  USE_VISION: "vision:use",
  USE_VOCAL: "vocal:use",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];

/**
 * Type guard
 */
export function isUserRole(value: unknown): value is UserRole {
  return value === "user" || value === "admin" || value === "free" || value === "pro";
}

/**
 * Normalisation DB -> UserRole (fallback safe)
 */
export function normalizeRole(value: unknown): UserRole {
  return isUserRole(value) ? value : "user";
}

/**
 * Permissions par rôle
 * (utilisé par auth.middleware + requirePermission)
 */
export function getPermissionsByRole(role: UserRole): Permission[] {
  switch (role) {
    case "admin":
      return Object.values(PERMISSIONS);

    case "pro":
      return [
        PERMISSIONS.ACCESS_DASHBOARD,
        PERMISSIONS.AI_USE,
        PERMISSIONS.AUTOMATION_USE,
        PERMISSIONS.DEVIS_READ,
        PERMISSIONS.DEVIS_WRITE,
        PERMISSIONS.USE_VISION,
        PERMISSIONS.USE_VOCAL,
      ];

    case "free":
    case "user":
    default:
      return [
        PERMISSIONS.ACCESS_DASHBOARD,
        PERMISSIONS.AI_USE,
        PERMISSIONS.DEVIS_READ,
      ];
  }
}