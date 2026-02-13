import sharp from "sharp";
import { Buffer } from "node:buffer";

/**
 * ==============================
 * IMAGE SANITIZER (STABLE)
 * ==============================
 */

const MAX_IMAGE_SIZE_BYTES = 5 * 1024 * 1024; // 5 Mo
const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;

export async function sanitizeImage(
  buffer: Buffer
): Promise<Buffer> {
  console.log("🧼 sanitizeImage START");
  console.log("➡️ buffer size:", buffer?.length);

  try {
    if (!buffer || buffer.length === 0) {
      throw new Error("EMPTY_IMAGE");
    }

    if (buffer.length > MAX_IMAGE_SIZE_BYTES) {
      throw new Error("IMAGE_TOO_LARGE");
    }

    // ⚠️ IMPORTANT : on enlève failOnError
    const image = sharp(buffer, {
      limitInputPixels: MAX_WIDTH * MAX_HEIGHT,
    });

    const metadata = await image.metadata();
    console.log("🧾 metadata:", metadata.format, metadata.width, metadata.height);

    if (!metadata.format) {
      throw new Error("INVALID_IMAGE");
    }

    const output = await image
      .rotate() // corrige orientation EXIF
      .resize({
        width: MAX_WIDTH,
        height: MAX_HEIGHT,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({
        quality: 85,
        progressive: true,
        chromaSubsampling: "4:4:4",
      })
      .toBuffer();

    console.log("🧼 sanitizeImage SUCCESS →", output.length);
    return output;

  } catch (error: unknown) {
    console.error("❌ [ImageSanitizer Error RAW]", error);

    if (error instanceof Error) {
      switch (error.message) {
        case "IMAGE_TOO_LARGE":
          throw new Error("L’image dépasse la taille maximale autorisée (5 Mo).");
        case "INVALID_IMAGE":
          throw new Error("Le fichier fourni n’est pas une image valide.");
        case "EMPTY_IMAGE":
          throw new Error("Aucune image fournie.");
      }

      // 🔎 on garde le vrai message sharp
      throw new Error(`sanitizeImage failed: ${error.message}`);
    }

    throw new Error("sanitizeImage failed: unknown error");
  }
}
