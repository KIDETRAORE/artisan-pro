import { Router } from "express";
import { authMiddleware } from "@middlewares/auth.middleware";
import { getUserInfo } from "@controllers/user.controller";

const router = Router();

/**
 * GET /api/user/me
 */
router.get("/me", authMiddleware, getUserInfo);

export default router;

