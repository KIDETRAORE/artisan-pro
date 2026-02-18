import { supabaseAdmin } from "../../lib/supabaseAdmin";


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
    console.error("❌ Supabase insert error:", error);
    throw error;
  }

  return data;
}
