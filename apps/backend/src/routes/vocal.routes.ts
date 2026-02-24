// apps/backend/src/routes/vocal.routes.ts
import { Router } from "express";
import { uploadMiddleware, handleAudioUpload } from "../controllers/vocal.controller";
import { authMiddleware } from "@middlewares/auth.middleware";

const router = Router();

router.post("/upload", authMiddleware, uploadMiddleware, handleAudioUpload);

export default router;