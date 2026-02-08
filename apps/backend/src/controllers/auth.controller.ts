import { Request, Response } from "express";

export class AuthController {
  static register(req: Request, res: Response) {
    res.status(201).json({
      message: "Register OK (placeholder)",
    });
  }

  static login(req: Request, res: Response) {
    res.status(200).json({
      message: "Login OK (placeholder)",
    });
  }

  static refreshToken(req: Request, res: Response) {
    res.status(200).json({
      message: "Refresh token OK (placeholder)",
    });
  }

  static logout(req: Request, res: Response) {
    res.status(200).json({
      message: "Logout OK (placeholder)",
    });
  }

  static me(req: Request, res: Response) {
    res.status(200).json({
      user: (req as any).user ?? null,
    });
  }
}
