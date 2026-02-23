import { Router, Request, Response } from "express";
import multer from "multer";
import { aiQueue } from "../queues/ai.queue";
import { logger } from "../utils/logger";

const router = Router();

// Configuration Multer pour la mémoire
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } 
});

/**
 * 1. LANCER UNE TÂCHE IA (POST /ai/run)
 */
router.post("/run", upload.single('file'), async (req: any, res: Response) => {
  logger.info("📩 [AI-ROUTE] Requête reçue sur /run");

  try {
    const { type } = req.body; 
    const file = req.file;

    if (!req.user || !req.user.id) {
      logger.error("❌ [AI-ROUTE] Utilisateur non authentifié");
      return res.status(401).json({ success: false, error: "Non authentifié" });
    }

    if (!file) {
      logger.warn("⚠️ [AI-ROUTE] Aucun fichier dans la requête");
      return res.status(400).json({ success: false, error: "Aucun fichier reçu" });
    }

    logger.info(`📄 [AI-ROUTE] Fichier reçu: ${file.originalname}`);

    const fileBase64 = file.buffer.toString('base64');
    
    // MODIFICATION ICI : On ajoute des options de conservation (Opts)
    const job = await aiQueue.add(
      "ai-task", 
      {
        type: type || 'vision',
        userId: req.user.id,
        fileBase64,
        mimeType: file.mimetype,
        fileName: file.originalname
      },
      {
        // On garde le job en mémoire pour que le frontend ait le temps de lire le résultat
        removeOnComplete: {
          age: 600, // Garder 10 minutes (600 secondes)
          count: 50 // Ou garder les 50 derniers jobs
        },
        removeOnFail: {
          age: 3600 // Garder les erreurs 1 heure
        }
      }
    );

    logger.info(`✅ [AI-ROUTE] Job créé: ${job.id}`);
    
    return res.status(200).json({ 
      success: true, 
      jobId: job.id 
    });

  } catch (error: any) {
    logger.error(`💥 [AI-ROUTE] Erreur /run: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * 2. RÉCUPÉRER LE STATUT (GET /ai/status/:jobId)
 */
router.get("/status/:jobId", async (req: Request, res: Response) => {
  try {
    const jobId = String(req.params.jobId);

    logger.info(`🔍 [AI-ROUTE] Vérification du statut pour le Job: ${jobId}`);

    if (!jobId || jobId === "undefined") {
      return res.status(400).json({ success: false, error: "ID de job invalide" });
    }

    const job = await aiQueue.getJob(jobId);

    if (!job) {
      logger.warn(`❓ [AI-ROUTE] Job ${jobId} non trouvé dans Redis (peut-être déjà nettoyé)`);
      return res.status(404).json({ success: false, message: "Analyse introuvable" });
    }

    const state = await job.getState(); 
    const result = job.returnvalue;

    logger.info(`📊 [AI-ROUTE] Job ${jobId} est actuellement : ${state}`);

    return res.json({
      success: true,
      status: state, 
      result: state === "completed" ? result : null,
      error: state === "failed" ? job.failedReason : null
    });

  } catch (error: any) {
    logger.error(`💥 [AI-ROUTE] Erreur /status: ${error.message}`);
    return res.status(500).json({ success: false, error: error.message });
  }
});

export default router;