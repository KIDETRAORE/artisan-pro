// middlewares/validatePrompt.ts
export const validatePrompt = (req: any, res: any, next: any) => {
  const type = req.params.type || req.baseUrl.split("/").pop();
  const body = req.body;

  if (!body || Object.keys(body).length === 0) {
    return res.status(400).json({
      message: "Requête vide",
    });
  }

  if (body.prompt && typeof body.prompt === "string") {
    if (body.prompt.length > 2000) {
      return res.status(400).json({
        message: "Prompt trop long",
      });
    }
  }

  if (type === "vision") {
    const base64Image = body.image;
    if (!base64Image) {
      return res.status(400).json({
        message: "Image requise",
      });
    }
  }

  next();
};
