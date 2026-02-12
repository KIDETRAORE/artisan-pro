import sharp from "sharp";
import { Buffer } from "node:buffer";

/**
 * ==============================
 * SERVICE DE SANITISATION D'IMAGE
 * ==============================
 */

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;

export async function sanitizeImage(
  buffer: Buffer
): Promise<Buffer> {
  try {
    if (!buffer || buffer.length === 0) {
      throw new Error("EMPTY_IMAGE");
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("IMAGE_TOO_LARGE");
    }

    const image = sharp(buffer, {
      failOnError: true,
      limitInputPixels: MAX_WIDTH * MAX_HEIGHT,
    });

    const metadata = await image.metadata();

    if (!metadata.format) {
      throw new Error("INVALID_IMAGE");
    }

    return await image
      .rotate() // corrige orientation EXIF
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      // ⚠️ PAS de withMetadata() → métadonnées supprimées par défaut
      .jpeg({
        quality: 85,
        progressive: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();

  } catch (error: unknown) {
    console.error("[ImageSanitizer Error]", error);

    if (error instanceof Error) {
      switch (error.message) {
        case "IMAGE_TOO_LARGE":
          throw new Error("L’image dépasse la taille maximale autorisée (5 Mo).");
        case "INVALID_IMAGE":
          throw new Error("Le fichier fourni n’est pas une image.");
        case "EMPTY_IMAGE":
          throw new Error("Aucune image fournie.");
      }
    }

    throw new Error("Erreur lors du traitement de l’image.");
  }
}
