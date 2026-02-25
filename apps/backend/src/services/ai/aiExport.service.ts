import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { db } from "../../config/db";
import { HttpError } from "../../utils/httpError";

type SaveExportInput = {
  jobId: string;
  userId: string;
  jsonBuffer: Buffer;
  csvBuffer: Buffer;
};

const BUCKET = "exports";

function exportPaths(userId: string, jobId: string) {
  const base = `users/${userId}/jobs/${jobId}`;
  return {
    jsonPath: `${base}/compta-report.json`,
    csvPath: `${base}/compta-report.csv`,
  };
}

export async function saveComptaExports(input: SaveExportInput) {
  const { jobId, userId, jsonBuffer, csvBuffer } = input;
  const { jsonPath, csvPath } = exportPaths(userId, jobId);

  // upload JSON
  const upJson = await supabaseAdmin.storage.from(BUCKET).upload(jsonPath, jsonBuffer, {
    contentType: "application/json",
    upsert: true,
  });
  if (upJson.error) throw new HttpError(500, `Export JSON upload failed: ${upJson.error.message}`);

  // upload CSV
  const upCsv = await supabaseAdmin.storage.from(BUCKET).upload(csvPath, csvBuffer, {
    contentType: "text/csv",
    upsert: true,
  });
  if (upCsv.error) throw new HttpError(500, `Export CSV upload failed: ${upCsv.error.message}`);

  // persist mapping
  await db.query(
    `
    insert into public.ai_exports (job_id, user_id, json_path, csv_path)
    values ($1, $2, $3, $4)
    on conflict (job_id) do update set json_path=$3, csv_path=$4
    `,
    [jobId, userId, jsonPath, csvPath]
  );

  return { jsonPath, csvPath };
}

export async function getExportPathForJob(jobId: string, userId: string, format: "json" | "csv") {
  const r = await db.query(
    `select json_path, csv_path from public.ai_exports where job_id=$1 and user_id=$2`,
    [jobId, userId]
  );
  const row = r.rows?.[0];
  if (!row) throw new HttpError(404, "Export introuvable");

  return format === "json" ? row.json_path : row.csv_path;
}

export async function downloadExport(path: string) {
  const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(path);
  if (error || !data) throw new HttpError(500, `Download failed: ${error?.message ?? "unknown"}`);
  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer);
}