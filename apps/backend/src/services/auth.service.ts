import bcrypt from "bcryptjs";
import { signAccessToken, signRefreshToken, verifyRefreshToken } from "../lib/jwt";

interface RegisterInput {
  email: string;
  password: string;
  name?: string;
}

export class AuthService {
  static async register(data: RegisterInput) {
    const hashedPassword = await bcrypt.hash(data.password, 10);

    // TODO: sauvegarder en DB
    return {
      id: "user-id",
      email: data.email,
      name: data.name,
    };
  }

  static async login(email: string, password: string) {
    // TODO: récupérer l'utilisateur en DB
    const user = {
      id: "user-id",
      email,
      passwordHash: await bcrypt.hash(password, 10),
    };

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) throw new Error("Invalid credentials");

    return {
      user: { id: user.id, email: user.email },
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
    };
  }

  static async refresh(refreshToken: string) {
    const payload = verifyRefreshToken(refreshToken);
    return {
      accessToken: signAccessToken(payload),
    };
  }

  static async logout(_refreshToken: string) {
    // TODO: invalider refresh token (DB / Redis plus tard)
  }
}
