import sharp from "sharp";
import { Buffer } from "node:buffer";

/**
 * ==============================
 * SERVICE DE SANITISATION D'IMAGE
 * ==============================
 * - Supprime EXIF / GPS / IPTC
 * - Normalise orientation
 * - Limite taille mémoire
 * - Optimise Vision tokens
 */

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;

export async function sanitizeImage(
  buffer: Buffer
): Promise<Buffer> {
  try {
    /**
     * Protection contre payloads abusifs
     */
    if (!buffer || buffer.length === 0) {
      throw new Error("EMPTY_IMAGE");
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("IMAGE_TOO_LARGE");
    }

    /**
     * Pipeline Sharp sécurisé
     */
    const image = sharp(buffer, {
      failOnError: true,
      limitInputPixels: MAX_WIDTH * MAX_HEIGHT,
    });

    const metadata = await image.metadata();

    if (!metadata.format) {
      throw new Error("INVALID_IMAGE");
    }

    /**
     * Normalisation & nettoyage
     */
    return await image
      .rotate()                 // corrige orientation EXIF
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .withMetadata(false)      // SUPPRESSION EXIF / GPS
      .jpeg({
        quality: 85,
        progressive: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();

  } catch (error: any) {
    console.error("[ImageSanitizer Error]", error);

    if (error.message === "IMAGE_TOO_LARGE") {
      throw new Error(
        "L’image dépasse la taille maximale autorisée (5 Mo)."
      );
    }

    if (error.message === "INVALID_IMAGE") {
      throw new Error(
        "Le fichier fourni n’est pas une image
