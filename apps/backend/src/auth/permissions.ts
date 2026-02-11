export type Permission =
  | "manage_users"
  | "delete_user"
  | "edit_user"
  | "view_admin_dashboard";

/**
 * Mapping ROLE ➜ PERMISSIONS
 */
export const ROLE_PERMISSIONS: Record<
  "admin" | "user",
  Permission[]
> = {
  admin: [
    "manage_users",
    "delete_user",
    "edit_user",
    "view_admin_dashboard",
  ],
  user: [],
};
