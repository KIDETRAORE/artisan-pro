import { Router } from "express";
import { authMiddleware } from "@middlewares/auth.middleware";
import { getUserInfo } from "@controllers/user.controller";
import { asyncHandler } from "@utils/asyncHandler";

const router = Router();

/**
 * GET /api/user/me
 */
router.get("/me", authMiddleware, asyncHandler(getUserInfo));

export default router;