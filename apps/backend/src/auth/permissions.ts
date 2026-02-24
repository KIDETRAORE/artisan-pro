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

  // ✅ Ajout pour correspondre à planPermission.mapper.ts
  USE_VISION: "vision:use",
  // (optionnel) si tu veux aussi une permission vocal
  USE_VOCAL: "vocal:use",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];