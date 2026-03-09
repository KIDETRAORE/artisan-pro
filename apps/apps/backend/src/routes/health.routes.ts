import { Router, Request, Response } from "express";

const router = Router();

/**
 * GET /health
 * Healthcheck public – utilisé par Docker, monitoring, load balancer
 */
router.get("/", (_req: Request, res: Response) => {
  return res.status(200).json({
    status: "ok",
    service: "ArtisanPro API",
    timestamp: new Date().toISOString(),
  });
});

export default router;
