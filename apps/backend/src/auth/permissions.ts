// auth/permissions.ts

export const PERMISSIONS = [
  "view_admin",
  "manage_users",
  "edit_user",
  "delete_user",
] as const;

export type Permission = typeof PERMISSIONS[number];

export type UserRole = "user" | "admin";

export const ROLE_PERMISSIONS: Record<UserRole, readonly Permission[]> = {
  user: [],
  admin: [
    "view_admin",
    "manage_users",
    "edit_user",
    "delete_user",
  ],
};
