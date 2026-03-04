// apps/backend/src/services/expertConversation.service.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

export type ExpertRole = "user" | "assistant" | "system";

export type ExpertMessageRow = {
  role: ExpertRole;
  content: string;
  created_at: string;
};

export async function getOrCreateConversationId(params: {
  userId: string;
  analysisId: string;
}): Promise<string> {
  const { userId, analysisId } = params;

  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("expert_conversations")
    .upsert(
      {
        user_id: userId,
        // ✅ on garde la dernière analyse associée (utile pour retrouver le contexte récent)
        analysis_id: analysisId,
        updated_at: nowIso,
      } as any,
      // ✅ FIX: doit matcher la contrainte UNIQUE (user_id, analysis_id)
      { onConflict: "user_id,analysis_id" }
    )
    .select("id")
    .single();

  if (error || !data?.id) {
    logger.error("[EXPERT] getOrCreateConversationId failed", {
      userId,
      analysisId,
      message: error?.message ?? "missing_conversation_id",
    });
    throw new Error("expert_conversation_upsert_failed");
  }

  return String(data.id);
}

export async function appendMessage(params: {
  conversationId: string;
  role: ExpertRole;
  content: string;
}) {
  const { conversationId, role, content } = params;

  const { error } = await supabaseAdmin.from("expert_messages").insert({
    conversation_id: conversationId,
    role,
    content,
  } as any);

  if (error) {
    logger.error("[EXPERT] appendMessage failed", {
      conversationId,
      role,
      message: error.message,
    });
    throw new Error("expert_message_insert_failed");
  }

  // Best-effort update updated_at on conversation (non bloquant)
  const nowIso = new Date().toISOString();
  const { error: updErr } = await supabaseAdmin
    .from("expert_conversations")
    .update({ updated_at: nowIso } as any)
    .eq("id", conversationId);

  if (updErr) {
    logger.warn("[EXPERT] conversation updated_at update failed (non-blocking)", {
      conversationId,
      message: updErr.message,
    });
  }
}

export async function getLastMessages(params: {
  conversationId: string;
  limit: number;
}): Promise<ExpertMessageRow[]> {
  const { conversationId, limit } = params;

  const { data, error } = await supabaseAdmin
    .from("expert_messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    logger.error("[EXPERT] getLastMessages failed", {
      conversationId,
      message: error.message,
    });
    throw new Error("expert_messages_select_failed");
  }

  const rows = (data ?? []) as ExpertMessageRow[];
  // On renvoie chronologique (ancien -> récent)
  return rows.reverse();
}