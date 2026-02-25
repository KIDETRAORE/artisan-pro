import type { Request, Response } from "express";
import { z } from "zod";
import { requireUser } from "../utils/requireUser";
import { getExportPathForJob, downloadExport } from "../services/ai/aiExport.service";

const querySchema = z.object({
  format: z.enum(["json", "csv"]).default("json"),
});

export async function downloadAiExport(req: Request, res: Response) {
  const user = requireUser(req);
  const jobId = String(req.params.jobId || "").trim();
  if (!jobId) return res.status(400).json({ success: false, message: "jobId manquant" });

  const q = querySchema.safeParse(req.query);
  if (!q.success) return res.status(400).json({ success: false, message: "format invalide" });

  const format = q.data.format;
  const path = await getExportPathForJob(jobId, user.id, format);
  const buf = await downloadExport(path);

  if (format === "json") {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="compta-${jobId}.json"`);
  } else {
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="compta-${jobId}.csv"`);
  }

  return res.status(200).send(buf);
}