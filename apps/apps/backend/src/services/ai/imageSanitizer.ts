import sharp from "sharp";
import { Buffer } from "node:buffer";
import { logger } from "../../utils/logger";

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;

export async function sanitizeImage(buffer: Buffer): Promise<Buffer> {
  logger.debug("sanitizeImage START", { size: buffer?.length });

  try {
    if (!buffer || buffer.length === 0) throw new Error("EMPTY_IMAGE");
    if (buffer.length > MAX_IMAGE_SIZE_BYTES) throw new Error("IMAGE_TOO_LARGE");

    const image = sharp(buffer, { limitInputPixels: MAX_WIDTH * MAX_HEIGHT });
    const metadata = await image.metadata();

    logger.debug("sanitizeImage metadata", {
      format: metadata.format,
      width: metadata.width,
      height: metadata.height,
    });

    if (!metadata.format) throw new Error("INVALID_IMAGE");

    const output = await image
      .rotate()
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 85, progressive: true, chromaSubsampling: "4:4:4" })
      .toBuffer();

    logger.debug("sanitizeImage SUCCESS", { outputSize: output.length });
    return output;
  } catch (error: unknown) {
    logger.error("ImageSanitizer error", { error });

    if (error instanceof Error) {
      switch (error.message) {
        case "IMAGE_TOO_LARGE":
          throw new Error("L’image dépasse la taille maximale autorisée (5 Mo).");
        case "INVALID_IMAGE":
          throw new Error("Le fichier fourni n’est pas une image valide.");
        case "EMPTY_IMAGE":
          throw new Error("Aucune image fournie.");
      }
      throw new Error(`sanitizeImage failed: ${error.message}`);
    }

    throw new Error("sanitizeImage failed: unknown error");
  }
}