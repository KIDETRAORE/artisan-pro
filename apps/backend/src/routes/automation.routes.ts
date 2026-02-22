import { Router } from "express";
import { runReminderAutomation } from "../automation/automation.engine";
import { logger } from "../utils/logger";

const router = Router();

// Route pour déclencher manuellement les relances (Test Postman)
router.post("/run-reminders", async (req, res) => {
  try {
    logger.info("🚀 Lancement manuel de l'automation des relances");
    await runReminderAutomation();
    res.json({ success: true, message: "Moteur d'automation lancé. Les jobs sont en file d'attente." });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;