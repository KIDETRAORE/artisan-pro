import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { logger } from "../../utils/logger";

export async function createVisionAnalysis(params: {
  userId: string;
  projectId?: string;
  analysis: any;
  confidence?: number;
  originalSize: number;
  sanitizedSize: number;
}) {
  const { data, error } = await supabaseAdmin
    .from("vision_analyses")
    .insert({
      user_id: params.userId,
      project_id: params.projectId ?? null,
      analysis: params.analysis,
      confidence: params.confidence ?? null,
      original_size: params.originalSize,
      sanitized_size: params.sanitizedSize,
    })
    .select()
    .single();

  if (error) {
    logger.error("Supabase insert error (vision_analyses)", {
      message: error.message,
      code: (error as any).code,
      userId: params.userId,
    });
    throw error;
  }

  return data;
}