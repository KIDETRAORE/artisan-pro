import { supabaseAdmin } from "./supabaseAdmin";
import { randomUUID } from "crypto";
import path from "path";
import { HttpError } from "../utils/httpError";

/**
 * ======================
 * BUCKETS AUTORISÉS
 * ======================
 */
export const STORAGE_BUCKETS = {
  IMAGES: "images",
  DOCUMENTS: "documents",
} as const;

type StorageBucket =
  (typeof STORAGE_BUCKETS)[keyof typeof STORAGE_BUCKETS];

/**
 * ======================
 * OPTIONS UPLOAD
 * ======================
 */
interface UploadOptions {
  bucket: StorageBucket;
  userId: string;
  folder?: string;
  mimeType?: string;
}

/**
 * ======================
 * UTILS INTERNES
 * ======================
 */
function sanitizePathSegment(segment: string): string {
  return segment.replace(/[^a-zA-Z0-9_-]/g, "");
}

function sanitizeFileName(name: string): string {
  return path.basename(name).replace(/[^a-zA-Z0-9._-]/g, "_");
}

/**
 * =========================
 * UPLOAD DE FICHIER GÉNÉRIQUE
 * =========================
 */
export async function uploadFile(
  fileBuffer: Buffer,
  originalName: string,
  options: UploadOptions
): Promise<{ path: string; publicUrl: string }> {
  if (!fileBuffer || !Buffer.isBuffer(fileBuffer)) {
    throw new HttpError(400, "Invalid file buffer");
  }

  if (!options.userId) {
    throw new HttpError(400, "Missing userId for upload");
  }

  const safeUserId = sanitizePathSegment(options.userId);
  const safeFolder = options.folder
    ? sanitizePathSegment(options.folder)
    : undefined;

  const safeOriginalName = sanitizeFileName(originalName);
  const extension = path.extname(safeOriginalName) || ".bin";
  const fileName = `${randomUUID()}${extension}`;

  const basePath = safeFolder
    ? `${safeUserId}/${safeFolder}`
    : `${safeUserId}`;

  const filePath = `${basePath}/${fileName}`;

  const { error } = await supabaseAdmin.storage
    .from(options.bucket)
    .upload(filePath, fileBuffer, {
      contentType: options.mimeType || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    console.error("[StorageService] Upload error:", {
      bucket: options.bucket,
      filePath,
      error,
    });
    throw new HttpError(500, "File upload failed");
  }

  const { data } = supabaseAdmin.storage
    .from(options.bucket)
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new HttpError(500, "Failed to retrieve public file URL");
  }

  return {
    path: filePath,
    publicUrl: data.publicUrl,
  };
}

/**
 * =========================
 * UPLOAD IMAGE SANITISÉE (VISION)
 * =========================
 * 👉 Utilisée dans vision.routes.ts
 */
export async function storeSanitizedImage(
  userId: string,
  feature: "vision",
  imageBuffer: Buffer
): Promise<{ path: string; publicUrl: string }> {
  if (!imageBuffer || !Buffer.isBuffer(imageBuffer)) {
    throw new HttpError(400, "Invalid image buffer");
  }

  return uploadFile(imageBuffer, "image.png", {
    bucket: STORAGE_BUCKETS.IMAGES,
    userId,
    folder: feature,
    mimeType: "image/png",
  });
}

/**
 * =========================
 * SUPPRESSION DE FICHIER
 * =========================
 */
export async function deleteFile(
  bucket: StorageBucket,
  filePath: string
): Promise<void> {
  if (!filePath) return;

  const { error } = await supabaseAdmin.storage
    .from(bucket)
    .remove([filePath]);

  if (error) {
    console.error("[StorageService] Delete error:", {
      bucket,
      filePath,
      error,
    });
    throw new HttpError(500, "File deletion failed");
  }
}

/**
 * =========================
 * URL PUBLIQUE
 * =========================
 */
export function getPublicUrl(
  bucket: StorageBucket,
  filePath: string): string {
  const { data } = supabaseAdmin.storage
    .from(bucket)
    .getPublicUrl(filePath);

  if (!data?.publicUrl) {
    throw new HttpError(404, "Public URL not found");
  }

  return data.publicUrl;
}
