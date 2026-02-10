import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { HttpError } from "../utils/httpError";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/jwt";

/**
 * ======================
 * Types
 * ======================
 */
interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

interface User {
  id: string;
  email: string;
  passwordHash: string;
  tokenVersion: number;
  createdAt: Date;
}

/**
 * ======================
 * Fake DB (temporaire)
 * ⚠️ À remplacer par Prisma / Sequelize
 * ======================
 */
const users = new Map<string, User>();

/**
 * ======================
 * Auth Service
 * ======================
 */
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
      throw new HttpError(400, "Mot de passe trop court (min 8 caractères)");
    }

    const existingUser = [...users.values()].find(
      (u) => u.email === email
    );

    if (existingUser) {
      throw new HttpError(409, "Utilisateur déjà existant");
    }

    const passwordHash = await bcrypt.hash(data.password, 10);

    const user: User = {
      id: uuid(),
      email,
      passwordHash,
      tokenVersion: 0,
      createdAt: new Date(),
    };

    users.set(user.id, user);

    return {
      id: user.id,
      email: user.email,
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

    // Message volontairement générique (anti-enum)
    if (!user) {
      throw new HttpError(401, "Identifiants invalides");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);

    if (!isValid) {
      throw new HttpError(401, "Identifiants invalides");
    }

    const payload = {
      id: user.id,
      email: user.email,
      tokenVersion: user.tokenVersion,
    };

    return {
      user: {
        id: user.id,
        email: user.email,
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

    try {
      // Vérification cryptographique
      const payload = verifyRefreshToken(refreshToken);

      const user = users.get(payload.id);

      if (!user) {
        throw new HttpError(401, "Utilisateur introuvable");
      }

      // Vérification révocation globale
      if (user.tokenVersion !== payload.tokenVersion) {
        throw new HttpError(401, "Refresh token révoqué");
      }

      const newPayload = {
        id: user.id,
        email: user.email,
        tokenVersion: user.tokenVersion,
      };

      return {
        accessToken: signAccessToken(newPayload),
        refreshToken: signRefreshToken(newPayload),
      };
    } catch (error) {
      throw new HttpError(401, "Refresh token invalide");
    }
  }

  /**
   * ======================
   * LOGOUT (révocation globale)
   * ======================
   */
  static async logout(userId: string) {
    const user = users.get(userId);

    if (!user) {
      // Pas d'erreur pour éviter les leaks
      return;
    }

    user.tokenVersion += 1;
    users.set(userId, user);
  }
}
