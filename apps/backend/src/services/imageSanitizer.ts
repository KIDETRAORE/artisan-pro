
import sharp from "sharp";
import { Buffer } from "node:buffer"; // Added import to fix 'Cannot find name Buffer'

/**
 * SERVICE DE NETTOYAGE D'IMAGE
 * Supprime les métadonnées EXIF (GPS, modèle téléphone, etc.) pour protéger la vie privée.
 * Redimensionne ou compresse si nécessaire pour optimiser les jetons Vision.
 */
export async function sanitizeImage(buffer: Buffer): Promise<Buffer> {
  try {
    return await sharp(buffer)
      .rotate()             // Réoriente l'image selon les tags EXIF avant de les supprimer
      .withMetadata(false)  // SUPPRESSION CRITIQUE DES MÉTADONNÉES (EXIF, GPS, IPTC)
      .jpeg({ 
        quality: 85,
        progressive: true,
        chromaSubsampling: '4:4:4'
      })
      .toBuffer();
  } catch (error) {
    console.error("[ImageSanitizer] Erreur lors du traitement :", error);
    throw new Error("Impossible de nettoyer l'image pour la sécurité.");
  }
}
