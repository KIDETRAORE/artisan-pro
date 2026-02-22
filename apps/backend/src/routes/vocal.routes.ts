import { Router } from "express";
import { uploadMiddleware, handleAudioUpload } from "../controllers/vocal.controller";

const router = Router();

/**
 * Route : POST /vocal/upload
 * - uploadMiddleware : Gère la réception du fichier et la limite de taille (10MB)
 * - handleAudioUpload : Valide la signature binaire et traite la réponse
 */
router.post("/upload", uploadMiddleware, handleAudioUpload);

export default router;