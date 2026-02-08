import bcrypt from "bcryptjs";
import { v4 as uuid } from "uuid";
import { HttpError } from "../utils/httpError";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../lib/jwt";

interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

// FAKE DB (temporaire)
const users = new Map<string, any>();

export class AuthService {
  // REGISTER
  static async register(data: RegisterInput) {
    const existingUser = [...users.values()].find(
      (u) => u.email === data.email
    );

    if (existingUser) {
      throw new HttpError(409, "Utilisateur déjà existant");
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = {
      id: uuid(),
      email: data.email,
      passwordHash: hashedPassword,
      tokenVersion: 0, // 🔐 important
    };

    users.set(user.id, user);

    return {
      id: user.id,
      email: user.email,
    };
  }

  // LOGIN
  static async login(email: string, password: string) {
    const user = [...users.values()].find((u) => u.email === email);

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

  // 🔁 REFRESH TOKEN (avec tokenVersion)
  static async refresh(refreshToken: string) {
    try {
      // 1️⃣ Vérification cryptographique
      const payload = verifyRefreshToken(refreshToken);

      // 2️⃣ Récupération user depuis "DB"
      const user = users.get(payload.id);

      if (!user) {
        throw new HttpError(401, "Utilisateur introuvable");
      }

      // 3️⃣ Vérification tokenVersion
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
    } catch {
      throw new HttpError(401, "Refresh token invalide");
    }
  }

  // LOGOUT (révocation globale)
  static async logout(userId: string) {
    const user = users.get(userId);
    if (user) {
      user.tokenVersion += 1; // 🔥 invalide tous les refresh tokens
      users.set(userId, user);
    }
  }
}

