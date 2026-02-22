import { Router } from "express";
import { reminderQueue } from "../queues/reminder.queue";
import { logger } from "../utils/logger";

const router = Router();

// 1. Lancer une tâche (Async)
router.post("/run", async (req: any, res) => {
  try {
    const { type, prompt, ...rest } = req.body;
    
    const job = await reminderQueue.add("ai-task", {
      type,
      payload: {
        userId: req.user.id,
        prompt,
        ...rest
      }
    });

    res.json({ success: true, jobId: job.id });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// 2. Récupérer le résultat
router.get("/status/:jobId", async (req, res) => {
  const job = await reminderQueue.getJob(req.params.jobId);

  if (!job) return res.status(404).json({ message: "Analyse introuvable" });

  const state = await job.getState(); // completed, failed, active, waiting
  const result = job.returnvalue;

  res.json({
    status: state,
    result: state === "completed" ? result : null,
    error: state === "failed" ? job.failedReason : null
  });
});

export default router;