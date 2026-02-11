import { Permission } from "./permissions";

/**
 * Rôles applicatifs
 */
export type Role = "user" | "admin";

/**
 * Mapping rôle ➜ permissions
 */
export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  user: [],
  admin: [
    "view_admin",
    "manage_users",
    "edit_user",
    "delete_user",
  ],
};
