import { Router } from "express";
import { authMiddleware } from "../middleware/auth.ts";
import { quotaService } from "../services/quotaService.ts";

const router = Router();

router.get("/", (_req: any, res: any) => {
  res.json({ status: "ok", service: "ArtisanPro API" });
});

export default router;