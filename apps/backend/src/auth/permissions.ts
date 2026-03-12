// apps/backend/src/auth/permissions.ts

/**
 * ============================
 * USER ROLES
 * ============================
 * Rôles applicatifs utilisés par requireRole()
 */
export type UserRole =
  | "user"
  | "admin"
  | "free"
  | "pro";

/**
 * ============================
 * PERMISSIONS MÉTIER
 * ============================
 * Format standard :
 *
 * module:action
 *
 * Exemple :
 * invoices:read
 * invoices:write
 */
export const PERMISSIONS = {
  /**
   * Dashboard
   */
  ACCESS_DASHBOARD: "dashboard:read",

  /**
   * Devis
   */
  DEVIS_READ: "devis:read",
  DEVIS_WRITE: "devis:write",

  /**
   * Factures
   */
  INVOICES_READ: "invoices:read",
  INVOICES_WRITE: "invoices:write",

  /**
   * Clients
   */
  CLIENTS_READ: "clients:read",
  CLIENTS_WRITE: "clients:write",

  /**
   * Projets / chantiers
   */
  PROJECTS_READ: "projects:read",
  PROJECTS_WRITE: "projects:write",

  /**
   * Lignes de facture
   */
  INVOICE_LINES_READ: "invoice_lines:read",
  INVOICE_LINES_WRITE: "invoice_lines:write",

  /**
   * IA
   */
  AI_USE: "ai:use",

  /**
   * Automatisation
   */
  AUTOMATION_USE: "automation:use",

  /**
   * Admin
   */
  MANAGE_USERS: "users:manage",

  /**
   * Modules IA spécialisés
   */
  USE_VISION: "vision:use",
  USE_VOCAL: "vocal:use",
} as const;

/**
 * ============================
 * TYPE PERMISSION
 * ============================
 */
export type Permission =
  typeof PERMISSIONS[keyof typeof PERMISSIONS];