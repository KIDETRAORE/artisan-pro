import jwt, { JwtPayload, SignOptions } from "jsonwebtoken";
import { HttpError } from "./httpError";

/**
 * =========================
 * SECRETS JWT
 * =========================
 */
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (!ACCESS_SECRET || !REFRESH_SECRET) {
  console.warn("⚠️ JWT secrets non définis — mode DEV uniquement");
}

/**
 * =========================
 * CONFIG JWT
 * =========================
 */
const JWT_ISSUER = "artisan-pro-api";
const JWT_AUDIENCE = "artisan-pro-client";
const ALGORITHM: jwt.Algorithm = "HS256";

const ACCESS_TOKEN_EXPIRES_IN = "15m";
const REFRESH_TOKEN_EXPIRES_IN = "7d";

/**
 * =========================
 * PERMISSIONS
 * =========================
 */
export const PERMISSIONS = [
  "view_admin",
  "manage_users",
  "delete_user",
  "edit_user",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * =========================
 * PAYLOAD JWT
 * =========================
 */
export interface JwtUserPayload {
  id: string;
  email: string;
  role: "user" | "admin";
  permissions: Permission[];
  tokenVersion: number;
}

/**
 * =========================
 * OPTIONS COMMUNES
 * =========================
 */
const baseJwtOptions: SignOptions = {
  issuer: JWT_ISSUER,
  audience: JWT_AUDIENCE,
  algorithm: ALGORITHM,
};

/**
 * =========================
 * SIGN ACCESS TOKEN
 * =========================
 */
export function signAccessToken(
  payload: JwtUserPayload
): string {
  if (!ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET manquant");
  }

  return jwt.sign(payload, ACCESS_SECRET, {
    ...baseJwtOptions,
    expiresIn: ACCESS_TOKEN_EXPIRES_IN,
  });
}

/**
 * =========================
 * SIGN REFRESH TOKEN
 * =========================
 */
export function signRefreshToken(
  payload: JwtUserPayload
): string {
  if (!REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET manquant");
  }

  return jwt.sign(payload, REFRESH_SECRET, {
    ...baseJwtOptions,
    expiresIn: REFRESH_TOKEN_EXPIRES_IN,
  });
}

/**
 * =========================
 * VERIFY ACCESS TOKEN
 * =========================
 */
export function verifyAccessToken(
  token: string
): JwtUserPayload {
  if (!ACCESS_SECRET) {
    throw new Error("JWT_ACCESS_SECRET manquant");
  }

  try {
    const decoded = jwt.verify(token, ACCESS_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [ALGORITHM],
    }) as JwtPayload;

    return validateJwtPayload(decoded);
  } catch {
    throw new HttpError(401, "Access token invalide ou expiré");
  }
}

/**
 * =========================
 * VERIFY REFRESH TOKEN
 * =========================
 */
export function verifyRefreshToken(
  token: string
): JwtUserPayload {
  if (!REFRESH_SECRET) {
    throw new Error("JWT_REFRESH_SECRET manquant");
  }

  try {
    const decoded = jwt.verify(token, REFRESH_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [ALGORITHM],
    }) as JwtPayload;

    return validateJwtPayload(decoded);
  } catch {
    throw new HttpError(401, "Refresh token invalide ou expiré");
  }
}

/**
 * =========================
 * VALIDATION PAYLOAD JWT
 * =========================
 */
function validateJwtPayload(
  decoded: JwtPayload
): JwtUserPayload {
  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof decoded.id !== "string" ||
    typeof decoded.email !== "string" ||
    (decoded.role !== "user" && decoded.role !== "admin") ||
    !Array.isArray(decoded.permissions) ||
    typeof decoded.tokenVersion !== "number"
  ) {
    throw new HttpError(401, "Payload JWT invalide");
  }

  const permissions = decoded.permissions.filter(
    (p): p is Permission =>
      PERMISSIONS.includes(p as Permission)
  );

  return {
    id: decoded.id,
    email: decoded.email,
    role: decoded.role,
    permissions,
    tokenVersion: decoded.tokenVersion,
  };
}
