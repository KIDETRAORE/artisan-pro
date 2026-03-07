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

  // ✅ Factures
  INVOICES_READ: "invoices:read",
  INVOICES_WRITE: "invoices:write",

  // ✅ Clients
  CLIENTS_READ: "clients:read",
  CLIENTS_WRITE: "clients:write",

  // ✅ Projets / chantiers
  PROJECTS_READ: "projects:read",
  PROJECTS_WRITE: "projects:write",

  // ✅ Lignes de facture
  INVOICE_LINES_READ: "invoice_lines:read",
  INVOICE_LINES_WRITE: "invoice_lines:write",

  // ✅ IA
  AI_USE: "ai:use",

  // ✅ Automatisation
  AUTOMATION_USE: "automation:use",

  // ✅ Admin
  MANAGE_USERS: "users:manage",

  // ✅ Modules IA spécifiques
  USE_VISION: "vision:use",
  USE_VOCAL: "vocal:use",
} as const;

export type Permission = typeof PERMISSIONS[keyof typeof PERMISSIONS];