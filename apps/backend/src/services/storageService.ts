
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { Buffer } from "node:buffer"; // Added import to fix 'Cannot find name Buffer'

/**
 * SERVICE DE STOCKAGE SÉCURISÉ
 * Gère l'archivage des photos de chantier avec une structure de dossiers
 * cloisonnée par utilisateur et des noms de fichiers imprévisibles (UUID).
 */

// Fix: Property 'cwd' does not exist on type 'Process'. Cast process to any.
const STORAGE_ROOT = path.join((process as any).cwd(), "storage");

export async function storeSanitizedImage(
  userId: string,
  category: "vision" | "compta",
  buffer: Buffer
): Promise<string> {
  // 1. Définition du chemin sécurisé : /storage/:userId/:category/
  const userFolder = path.join(STORAGE_ROOT, userId, category);
  
  try {
    // 2. Création récursive des dossiers si inexistants (Cloisonnement)
    await fs.mkdir(userFolder, { recursive: true });

    // 3. Génération d'un nom de fichier anonyme et unique
    const fileName = `${randomUUID()}.jpg`;
    const filePath = path.join(userFolder, fileName);

    // 4. Écriture physique sur le disque
    await fs.writeFile(filePath, buffer);

    // Retourne le chemin relatif pour la base de données
    return path.join(userId, category, fileName);
  } catch (error) {
    console.error("[StorageService] Erreur d'écriture :", error);
    throw new Error("Échec du stockage sécurisé de l'image.");
  }
}
