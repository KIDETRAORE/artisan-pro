// apps/frontend/src/api/auth.api.ts

export type Permission =
  | "devis:read"
  | "devis:write"
  | "compta:read"
  | "compta:write"
  | "vision:read"
  | "vision:write"
  | "admin";

// Type frontend "safe" (role/permissions peuvent venir d'une table user_profile ou metadata)
export type UserRole = "admin" | "user";

export type AuthUser = {
  id: string;
  email?: string | null;
  role?: UserRole;          // optionnel -> évite les TS errors si non chargé
  permissions?: Permission[]; // optionnel -> évite les TS errors si non chargé
};