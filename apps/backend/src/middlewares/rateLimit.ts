/**
 * MIDDLEWARE RATE LIMIT (Optimisé)
 * Protège l'infrastructure contre les abus et préserve les jetons API Gemini.
 */
const requestCounts = new Map<string, { count: number, lastReset: number }>();

export const rateLimiter = (req: any, res: any, next: any) => {
  // Identification de l'artisan par IP ou ID utilisateur si disponible
  const identifier = req.user?.sub || req.ip || 'anonymous';
  const now = Date.now();
  
  // Fenêtre : 1 minute | Max : 30 requêtes (selon demande utilisateur)
  const windowMs = 60 * 1000;
  const maxRequests = 30;

  const userData = requestCounts.get(identifier) || { count: 0, lastReset: now };

  // Réinitialisation si la fenêtre est passée
  if (now - userData.lastReset > windowMs) {
    userData.count = 0;
    userData.lastReset = now;
  }

  userData.count++;
  requestCounts.set(identifier, userData);

  if (userData.count > maxRequests) {
    const retryIn = Math.ceil((userData.lastReset + windowMs - now) / 1000);
    return res.status(429).json({ 
      error: "Limite de débit atteinte", 
      message: `Trop de requêtes. Réessayez dans ${retryIn} secondes.`,
      retryAfter: retryIn
    });
  }

  // Nettoyage périodique pour éviter l'engorgement mémoire
  if (requestCounts.size > 2000) {
    const expired = now - windowMs;
    for (const [key, val] of requestCounts.entries()) {
      if (val.lastReset < expired) requestCounts.delete(key);
    }
  }

  next();
};
