// apps/backend/src/routes/vocal.routes.ts
import { Router } from "express";
import { uploadMiddleware, handleAudioUpload } from "../controllers/vocal.controller";
import { authMiddleware } from "@middlewares/auth.middleware";
import { asyncHandler } from "@utils/asyncHandler";
import { quotaMiddleware } from "@middlewares/quota.middleware";

const router = Router();

// Ordre important : auth -> upload -> controller
router.post("/upload", authMiddleware,quotaMiddleware, uploadMiddleware, asyncHandler(handleAudioUpload));

export default router;