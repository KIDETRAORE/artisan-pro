import { quotaService } from "../services/quotaService.ts";

/**
 * MIDDLEWARE QUOTA IA
 * Vérifie l'éligibilité de l'artisan avant l'appel API Gemini.
 */
export const quotaMiddleware = async (req: any, res: any, next: any) => {
  const userId = req.user?.sub || req.params.userId;
  const feature = req.params.type || req.baseUrl.split('/').pop() || 'generic';

  if (!userId) return next();

  try {
    const check = await quotaService.checkAndLockQuota(userId, feature);
    
    if (!check.allowed) {
      return res.status(429).json({
        error: "Accès IA restreint",
        message: check.reason || "Quota mensuel atteint."
      });
    }
    
    next();
  } catch (error) {
    console.error("[QuotaMiddleware Error]:", error);
    next(); 
  }
};