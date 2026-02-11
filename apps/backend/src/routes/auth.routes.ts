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
 */
router.post(
  "/refresh",
  AuthController.refreshToken
);

/**
 * LOGOUT
 */
router.post(
  "/logout",
  authMiddleware,
  AuthController.logout
);

/**
 * ME
 */
router.get(
  "/me",
  authMiddleware,
  AuthController.me
);

export default router;
