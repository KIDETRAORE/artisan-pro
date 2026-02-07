import { Router } from "express";
import { authMiddleware } from "../middleware/auth.ts";
import { rateLimiter } from "../middleware/rateLimit.ts";
import { quotaMiddleware } from "../middleware/quota.ts";
import { validatePrompt } from "../middleware/validate.ts";
import { runAI } from "../services/gemini.ts";
import { quotaService } from "../services/quotaService.ts";

const router = Router();

router.post("/generate/:userId", authMiddleware, rateLimiter, quotaMiddleware, validatePrompt, async (req: any, res: any) => {
  try {
    const { userId } = req.params;
    if (req.user.sub !== userId) {
      return res.status(403).json({ error: "Accès interdit" });
    }
    
    const response = await runAI("devis", req.body);
    
    // ENREGISTREMENT DE L'USAGE (Conversion JSON pour estimer les tokens)
    const inputStr = JSON.stringify(req.body);
    const outputStr = JSON.stringify(response);
    await quotaService.recordUsage(userId, "devis", inputStr, outputStr).catch(e => console.error("Usage log error:", e));
    
    res.json({ response });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

export default router;