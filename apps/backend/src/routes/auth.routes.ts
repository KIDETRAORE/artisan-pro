import { Router } from "express";
import { AuthController } from "../controllers/auth.controller";
import { authMiddleware } from "../middlewares/auth";
import { validate } from "../middlewares/validate";
import {
  loginSchema,
  registerSchema,
  refreshSchema,
} from "../validators/auth.schema";

const router = Router();

// REGISTER
router.post(
  "/register",
  validate(registerSchema),
  AuthController.register
);

// LOGIN
router.post(
  "/login",
  validate(loginSchema),
  AuthController.login
);

// REFRESH
router.post(
  "/refresh",
  validate(refreshSchema),
  AuthController.refreshToken
);

// LOGOUT
router.post("/logout", AuthController.logout);

// ME (protégé)
router.get("/me", authMiddleware, AuthController.me);


export default router;

