// apps/backend/src/routes/automation.routes.ts
import { Router } from "express";
import { runReminderAutomation } from "../automation/automation.engine";
import { logger } from "../utils/logger";
import { authMiddleware } from "@middlewares/auth.middleware";
import { requireRole } from "@middlewares/requireRole.middleware";

const router = Router();

router.post("/run-reminders", authMiddleware, requireRole("admin"), async (_req, res) => {
  try {
    logger.info("🚀 Lancement manuel de l'automation des relances");
    await runReminderAutomation();
    return res.json({ success: true, message: "Jobs en file d'attente." });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

export default router;