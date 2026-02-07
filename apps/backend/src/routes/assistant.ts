import { Router } from "express";
import { authMiddleware } from "../middleware/auth.ts";
import { rateLimiter } from "../middleware/rateLimit.ts";
import { quotaMiddleware } from "../middleware/quota.ts";
import { validatePrompt } from "../middleware/validate.ts";
import { runAI } from "../services/gemini.ts";
import { quotaService } from "../services/quotaService.ts";

const router = Router();

router.post("/ask/:userId", authMiddleware, rateLimiter, quotaMiddleware, validatePrompt, async (req: any, res: any) => {
  try {
    const { userId } = req.params;
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: "Accès interdit" });
    }
    
    const prompt = req.body.prompt;
    const response = await runAI("assistant", prompt);
    
    // ENREGISTREMENT DE L'USAGE APRÈS SUCCÈS (Poids : 1 crédit + estimation tokens)
    await quotaService.recordUsage(userId, "assistant", prompt, response).catch(e => console.error("Usage log error:", e));
    
    res.json({ response });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;