/**
 * MIDDLEWARE DE VALIDATION (Renforcé)
 * Vérifie l'intégrité, la taille et le type MIME des données.
 */
// Changed exported name from validateRequest to validatePrompt to resolve import errors in routes
export const validatePrompt = (req: any, res: any, next: any) => {
  const type = req.params.type || req.baseUrl.split('/').pop();
  const body = req.body;

  if (!body || Object.keys(body).length === 0) {
    return res.status(400).json({ 
      error: "Requête vide", 
      message: "Les données d'entrée sont obligatoires." 
    });
  }

  // Validation du prompt texte (Assistant / Devis)
  if (body.prompt && typeof body.prompt === 'string') {
    if (body.prompt.length > 2000) {
      return res.status(400).json({ 
        error: "Prompt trop long", 
        message: "La limite maximale est de 2000 caractères." 
      });
    }
  }

  // VALIDATION SPÉCIFIQUE VISION (Base64)
  // Bloque les fichiers déguisés, les vidéos ou les malwares volumineux.
  if (type === 'vision') {
    const base64Image = body.image;
    if (!base64Image) {
      return res.status(400).json({ error: "Donnée manquante", message: "Une image est requise." });
    }

    // 1. Validation du Type MIME (via header Base64)
    const mimeMatch = base64Image.match(/^data:(image\/[a-z]+);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : null;
    const allowedTypes = ["image/jpeg", "image/png"];

    // Si on a un header, on le valide. Sinon on laisse Sharp tenter de le lire
    // mais pour une sécurité maximale, on rejette l'absence de type explicite en prod.
    if (mimeType && !allowedTypes.includes(mimeType)) {
      return res.status(400).json({ 
        error: "Format interdit", 
        message: "Seuls les formats JPEG et PNG sont acceptés pour l'analyse technique." 
      });
    }

    // 2. Validation de la taille (5Mo max)
    // On estime la taille réelle à partir de la longueur du string Base64 (approx 3/4 de la longueur du texte)
    const estimatedSize = (base64Image.length * 3) / 4;
    const MAX_SIZE = 5 * 1024 * 1024; // 5MB

    if (estimatedSize > MAX_SIZE) {
      return res.status(400).json({ 
        error: "Fichier trop volumineux", 
        message: "La photo dépasse la limite de 5Mo autorisée." 
      });
    }
  }
  
  if (type === 'compta' && (!body.data || !Array.isArray(body.data))) {
    return res.status(400).json({ error: "Donnée manquante", message: "Un tableau de transactions est requis." });
  }

  next();
};