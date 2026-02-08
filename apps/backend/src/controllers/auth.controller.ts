import { Request, Response } from "express";
import { AuthService } from "../services/auth.service";

export class AuthController {
  static async register(req: Request, res: Response) {
    const user = await AuthService.register(req.body);
    return res.status(201).json({ user });
  }

  static async login(req: Request, res: Response) {
    const result = await AuthService.login(
      req.body.email,
      req.body.password
    );
    return res.status(200).json(result);
  }

  static async refreshToken(req: Request, res: Response) {
    const tokens = await AuthService.refresh(req.body.refreshToken);
    return res.status(200).json(tokens);
  }

  static async logout(_req: Request, res: Response) {
    return res.status(204).send();
  }

  static async me(req: Request, res: Response) {
    return res.status(200).json({
      user: (req as any).user,
    });
  }
}



