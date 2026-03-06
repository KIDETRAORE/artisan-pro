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

  // ✅ NOUVEAU: permissions dédiées (factures + clients)
  INVOICES_READ: "invoices:read",
  INVOICES_WRITE: "invoices:write",
  CLIENTS_READ: "clients:read",
  CLIENTS_WRITE: "clients:write",

  // ✅ AJOUT: projets / chantiers
  PROJECTS_READ: "projects:read",
  PROJECTS_WRITE: "projects:write",

  // ✅ AJOUT: permissions lignes de facture
  INVOICE_LINES_READ: "invoice_lines:read",
  INVOICE_LINES_WRITE: "invoice_lines:write",

  AI_USE: "ai:use",
  AUTOMATION_USE: "automation:use",
  MANAGE_USERS: "users:manage",

  // ✅ Ajout pour correspondre à planPermission.mapper.ts
  USE_VISION: "vision:use",
  // (optionnel) si tu veux aussi une permission vocal
  USE_VOCAL: "vocal:use",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];