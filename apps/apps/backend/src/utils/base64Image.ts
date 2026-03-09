import { Buffer } from "node:buffer";

/**
 * Convertit une image base64 (data URI) en Buffer propre
 */
export function base64ImageToBuffer(dataUri: string): Buffer {
  if (!dataUri || typeof dataUri !== "string") {
    throw new Error("INVALID_IMAGE_INPUT");
  }

  // Format attendu :
  // data:image/jpeg;base64,XXXXX
  const match = dataUri.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match || !match[2]) {
    throw new Error("INVALID_BASE64_IMAGE_FORMAT");
  }

  const base64Data = match[2];

  try {
    return Buffer.from(base64Data, "base64");
  } catch {
    throw new Error("BASE64_DECODE_FAILED");
  }
}
