import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { HttpError } from "../utils/httpError";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  type Permission,
} from "../utils/jwt";

/**
 * ======================
 * TYPES
 * ======================
 */
interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export type UserRole = "user" | "admin";

interface User {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  tokenVersion: number;
  createdAt: Date;
}

/**
 * ======================
 * ROLE → PERMISSIONS
 * (SOURCE DE VÉRITÉ)
 * ======================
 */
const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  user: [],
  admin: [
    "view_admin",
    "manage_users",
    "edit_user",
    "delete_user",
  ],
};

/**
 * ======================
 * FAKE DB
 * ======================
 */
const users = new Map<string, User>();

export class AuthService {
  /**
   * ======================
   * REGISTER
   * ======================
   */
  static async register(data: RegisterInput) {
    const email = data.email.toLowerCase().trim();

    if (!email || !data.password) {
      throw new HttpError(400, "Email et mot de passe requis");
    }

    if (data.password.length < 8) {
      throw new HttpError(400, "Mot de passe trop court");
    }

    const existingUser = [...users.values()].find(
      (u) => u.email === email
    );

    if (existingUser) {
      throw new HttpError(409, "Utilisateur déjà existant");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const isFirstUser = users.size === 0;
    const role: UserRole = isFirstUser ? "admin" : "user";

    const user: User = {
      id: uuid(),
      email,
      passwordHash,
      role,
      tokenVersion: 0,
      createdAt: new Date(),
    };

    users.set(user.id, user);

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions: ROLE_PERMISSIONS[user.role],
    };
  }

  /**
   * ======================
   * LOGIN
   * ======================
   */
  static async login(email: string, password: string) {
    const normalizedEmail = email.toLowerCase().trim();

    const user = [...users.values()].find(
      (u) => u.email === normalizedEmail
    );

    if (!user) {
      throw new HttpError(401, "Identifiants invalides");
    }

    const isValid = await bcrypt.compare(
      password,
      user.passwordHash
    );

    if (!isValid) {
      throw new HttpError(401, "Identifiants invalides");
    }

    const permissions = ROLE_PERMISSIONS[user.role];

    const payload = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions,
      tokenVersion: user.tokenVersion,
    };

    return {
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        permissions,
      },
      accessToken: signAccessToken(payload),
      refreshToken: signRefreshToken(payload),
    };
  }

  /**
   * ======================
   * REFRESH TOKEN
   * ======================
   */
  static async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new HttpError(401, "Refresh token manquant");
    }

    const payload = verifyRefreshToken(refreshToken);
    const user = users.get(payload.id);

    if (!user || user.tokenVersion !== payload.tokenVersion) {
      throw new HttpError(401, "Refresh token invalide");
    }

    const permissions = ROLE_PERMISSIONS[user.role];

    const newPayload = {
      id: user.id,
      email: user.email,
      role: user.role,
      permissions,
      tokenVersion: user.tokenVersion,
    };

    return {
      accessToken: signAccessToken(newPayload),
      refreshToken: signRefreshToken(newPayload),
    };
  }

  /**
   * ======================
   * LOGOUT
   * ======================
   */
  static async logout(userId: string) {
    const user = users.get(userId);
    if (!user) return;

    user.tokenVersion += 1;
    users.set(userId, user);
  }
}
