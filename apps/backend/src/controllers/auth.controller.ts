import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

export class AuthController {
  /**
   * REGISTER
   */
  static async register(req: Request, res: Response) {
    const user = await AuthService.register(req.body);
    return res.status(201).json({ user });
  }

  /**
   * LOGIN
   * ➜ pose le refreshToken en cookie httpOnly
   */
  static async login(req: Request, res: Response) {
    const { user, accessToken, refreshToken } =
      await AuthService.login(req.body.email, req.body.password);

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: false,          // ⚠️ true UNIQUEMENT en HTTPS
      sameSite: "lax",
      path: "/",              // ✅ OBLIGATOIRE pour refresh + logout
    });

    return res.status(200).json({
      user,
      accessToken,
    });
  }

  /**
   * REFRESH TOKEN
   * ➜ lit le cookie refreshToken
   * ➜ retourne un nouvel accessToken
   * ➜ rotation du refreshToken
   */
  static async refreshToken(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (!refreshToken) {
      return res.status(401).json({ message: "No refresh token" });
    }

    const { accessToken, refreshToken: newRefreshToken } =
      await AuthService.refresh(refreshToken);

    // 🔁 rotation du refresh token
    res.cookie("refreshToken", newRefreshToken, {
      httpOnly: true,
      secure: false,
      sameSite: "lax",
      path: "/",              // ✅ DOIT matcher le cookie initial
    });

    return res.status(200).json({ accessToken });
  }

  /**
   * LOGOUT
   * ➜ invalide les refresh tokens (tokenVersion++)
   * ➜ supprime le cookie
   */
  static async logout(req: Request, res: Response) {
    const refreshToken = req.cookies?.refreshToken;

    if (refreshToken) {
      await AuthService.invalidateRefreshToken(refreshToken).catch(() => null);
    }

    res.clearCookie("refreshToken", {
      path: "/",              // ✅ DOIT matcher
    });

    return res.status(204).send();
  }

  /**
   * ME
   * ➜ user injecté par auth middleware
   */
  static async me(req: Request, res: Response) {
    return res.status(200).json({
      user: (req as any).user,
    });
  }
}
