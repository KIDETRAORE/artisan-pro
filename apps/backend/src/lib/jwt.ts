import jwt, { JwtPayload } from "jsonwebtoken";

/**
 * ⚠️ En production : UNIQUEMENT via variables d'environnement
 */
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || "access-secret";
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "refresh-secret";

// ⚠️ Warning DEV uniquement
if (!process.env.JWT_ACCESS_SECRET) {
  console.warn("⚠️ JWT_ACCESS_SECRET non défini (DEV uniquement)");
}

if (!process.env.JWT_REFRESH_SECRET) {
  console.warn("⚠️ JWT_REFRESH_SECRET non défini (DEV uniquement)");
}


const JWT_ISSUER = "artisan-pro-api";
const JWT_AUDIENCE = "artisan-pro-client";
const ALGORITHM = "HS256";

/**
 * Payload minimal des JWT
 */
export interface JwtUserPayload {
  id: string;
  email: string;
  tokenVersion: number;
}

/**
 * =========================
 * ACCESS TOKEN (15 minutes)
 * =========================
 */
export function signAccessToken(user: JwtUserPayload): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    },
    ACCESS_SECRET,
    {
      expiresIn: "15m",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: ALGORITHM,
    }
  );
}

/**
 * =========================
 * REFRESH TOKEN (7 jours)
 * =========================
 */
export function signRefreshToken(user: JwtUserPayload): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    },
    REFRESH_SECRET,
    {
      expiresIn: "7d",
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: ALGORITHM,
    }
  );
}

/**
 * =========================
 * VÉRIFICATION ACCESS TOKEN
 * =========================
 */
export function verifyAccessToken(token: string): JwtUserPayload {
  const decoded = jwt.verify(token, ACCESS_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: [ALGORITHM],
  }) as JwtPayload;

  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof decoded.id !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.tokenVersion !== "number"
  ) {
    throw new Error("Invalid access token payload");
  }

  return {
    id: decoded.id,
    email: decoded.email,
    tokenVersion: decoded.tokenVersion,
  };
}

/**
 * =========================
 * VÉRIFICATION REFRESH TOKEN
 * =========================
 */
export function verifyRefreshToken(token: string): JwtUserPayload {
  const decoded = jwt.verify(token, REFRESH_SECRET, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
    algorithms: [ALGORITHM],
  }) as JwtPayload;

  if (
    !decoded ||
    typeof decoded !== "object" ||
    typeof decoded.id !== "string" ||
    typeof decoded.email !== "string" ||
    typeof decoded.tokenVersion !== "number"
  ) {
    throw new Error("Invalid refresh token payload");
  }

  return {
    id: decoded.id,
    email: decoded.email,
    tokenVersion: decoded.tokenVersion,
  };
}
