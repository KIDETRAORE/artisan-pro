// src/api/auth.api.ts
import { API_URL } from "../config/api";

/**
 * ======================
 * ROLES
 * ======================
 */
export type UserRole = "user" | "admin";

/**
 * ======================
 * PERMISSIONS
 * ======================
 */
export type Permission =
  | "manage_users"
  | "delete_user"
  | "edit_user"
  | "view_admin_dashboard";

/**
 * ======================
 * TYPES
 * ======================
 */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  permissions: Permission[]; // ✅ AJOUT CRITIQUE
}

export interface AuthResponse {
  user: AuthUser;
  accessToken: string;
}

/**
 * ======================
 * LOGIN
 * ======================
 */
export async function login(
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // refresh token en cookie httpOnly
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error("Login failed");
  }

  /**
   * Backend doit renvoyer :
   * {
   *   user: { id, email, role, permissions },
   *   accessToken
   * }
   */
  return res.json();
}

/**
 * ======================
 * REFRESH TOKEN
 * ======================
 */
export async function refresh(): Promise<{ accessToken: string } | null> {
  const res = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) return null;

  return res.json();
}

/**
 * ======================
 * LOGOUT
 * ======================
 */
export async function logout(): Promise<void> {
  await fetch(`${API_URL}/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

/**
 * ======================
 * GET CURRENT USER
 * ======================
 */
export async function me(
  accessToken: string
): Promise<AuthUser> {
  const res = await fetch(`${API_URL}/auth/me`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });

  if (!res.ok) {
    throw new Error("Unauthorized");
  }

  /**
   * Doit renvoyer :
   * { id, email, role, permissions }
   */
  return res.json();
}
