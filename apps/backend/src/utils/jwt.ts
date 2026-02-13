import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import type { Permission, UserRole } from "../auth/permissions";
import { ENV } from "../config/env";

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
 * INTERNAL CONFIG (TS SAFE)
 * ======================
 */
const accessTokenSecret: Secret = ENV.JWT_ACCESS_SECRET;
const refreshTokenSecret: Secret = ENV.JWT_REFRESH_SECRET;

/**
 * jsonwebtoken attend :
 * expiresIn?: number | ms.StringValue
 * ENV expose des string => cast explicite requis
 */
const accessTokenOptions: SignOptions = {
  expiresIn: ENV.ACCESS_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
};

const refreshTokenOptions: SignOptions = {
  expiresIn: ENV.REFRESH_TOKEN_EXPIRES_IN as SignOptions["expiresIn"],
};

/**
 * ======================
 * SIGN TOKENS
 * ======================
 */
export function signAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, accessTokenSecret, accessTokenOptions);
}

export function signRefreshToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, refreshTokenSecret, refreshTokenOptions);
}

/**
 * ======================
 * VERIFY TOKENS
 * ======================
 */
export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, accessTokenSecret) as JwtUserPayload;
}

export function verifyRefreshToken(token: string): JwtUserPayload {
  return jwt.verify(token, refreshTokenSecret) as JwtUserPayload;
}
