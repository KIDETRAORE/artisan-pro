import jwt from "jsonwebtoken";
import type { Permission, UserRole } from "../auth/permissions";

/**
 * ======================
 * JWT PAYLOAD (SOURCE DE VÉRITÉ)
 * ======================
 */
export interface JwtUserPayload {
  id: string;
  email: string;
  role: UserRole;
  permissions: readonly Permission[];
  tokenVersion: number;
}

/**
 * ======================
 * CONFIG
 * ======================
 */
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET!;
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET!;

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

/**
 * ======================
 * SIGN TOKENS
 * ======================
 */
export function signAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, {
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

export function signRefreshToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, {
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

/**
 * ======================
 * VERIFY TOKENS
 * ======================
 */
export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, ACCESS_TOKEN_SECRET) as JwtUserPayload;
}

export function verifyRefreshToken(token: string): JwtUserPayload {
  return jwt.verify(token, REFRESH_TOKEN_SECRET) as JwtUserPayload;
}
