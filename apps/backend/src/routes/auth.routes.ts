import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { validate } from "../middlewares/validate.middleware";
import {
  loginSchema,
  registerSchema,
} from "../validators/auth.schema";

const router = Router();

/**
 * REGISTER
 */
router.post(
  "/register",
  validate(registerSchema),
  AuthController.register
);

/**
 * LOGIN
 */
router.post(
  "/login",
  validate(loginSchema),
  AuthController.login
);

/**
 * REFRESH TOKEN
 * ➜ pas de validation Zod sur les cookies
 * ➜ le refreshToken vient UNIQUEMENT du cookie httpOnly
 */
router.post(
  "/refresh",
  AuthController.refreshToken
);

/**
 * LOGOUT
 * ➜ protégé (accessToken requis)
 */
router.post(
  "/logout",
  authMiddleware,
  AuthController.logout
);

/**
 * ME
 * ➜ retourne l'utilisateur courant
 */
router.get(
  "/me",
  authMiddleware,
  AuthController.me
);

export default router;
