import { API_URL } from "../config/api";

/**
 * ======================
 * TYPES
 * ======================
 */
export interface AuthUser {
  id: string;
  email: string;
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
    credentials: "include", // cookies httpOnly (refresh token)
    body: JSON.stringify({ email, password }),
  });

  if (!res.ok) {
    throw new Error("Login failed");
  }

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
 * ✅ AJOUTÉ POUR FIXER TON ERREUR
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

  return res.json();
}

