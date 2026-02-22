import { fileTypeFromBuffer } from "file-type";
import { logger } from "./logger";
import { HttpError } from "./httpError";

/**
 * Valide si un buffer correspond réellement à un fichier audio
 * (Analyse de la signature binaire / Magic Number)
 */
export async function validateAudio(buffer: Buffer): Promise<void> {
  const type = await fileTypeFromBuffer(buffer);

  if (!type || !type.mime.startsWith("audio/")) {
    logger.warn("Tentative d'upload d'un fichier non-audio", { 
      detectedType: type ? type.mime : "unknown" 
    });
    
    throw new HttpError(400, "Le fichier n'est pas un format audio valide.");
  }

  logger.debug("Validation audio réussie", { mime: type.mime });
}