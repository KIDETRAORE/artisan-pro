// apps/backend/src/routes/automation.routes.ts

import { Router } from "express";
import { runReminderAutomation } from "../automation/automation.engine";
import { logger } from "../utils/logger";
import { authMiddleware } from "@middlewares/auth.middleware";
import { requireRole } from "@middlewares/requireRole.middleware";
import { sendError } from "../utils/apiError";

const router = Router();

router.post(
  "/run-reminders",
  authMiddleware,
  requireRole("admin"),
  async (req, res) => {
    try {
      logger.info("🚀 Lancement manuel de l'automation des relances");

      await runReminderAutomation();

      return res.json({ success: true, message: "Jobs en file d'attente." });
    } catch (error: any) {
      return sendError(req, res, 500, "internal_error", "Internal error");
    }
  }
);

export default router;