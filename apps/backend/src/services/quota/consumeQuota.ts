import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { logger } from "../../utils/logger";

export type ConsumeQuotaOk = {
  ok: true;
  used: number;
  limit: number;
  reset_at: string | null;
};

export type ConsumeQuotaErr = {
  ok: false;
  error: string;
  used?: number;
  limit?: number;
  reset_at?: string | null;
};

export type ConsumeQuotaResult = ConsumeQuotaOk | ConsumeQuotaErr;

/**
 * Consomme du quota IA de façon ATOMIQUE via la RPC Postgres `consume_ai_quota`.
 * - units = nombre d'unités à consommer (ex: 1 action, ou poids de feature)
 * - met à jour profiles (cache UI) en best-effort (non bloquant)
 */
export async function consumeAiQuotaOrThrow(
  userId: string,
  units = 1
): Promise<ConsumeQuotaOk> {
  const { data, error } = await supabaseAdmin.rpc("consume_ai_quota", {
    p_user_id: userId,
    p_units: units,
  });

  if (error) {
    logger.error("❌ consume_ai_quota RPC error", { userId, error });
    throw new Error("quota_rpc_error");
  }

  const result = data as ConsumeQuotaResult;

  if (!result || result.ok !== true) {
    const errCode = result?.error ?? "quota_unknown_error";
    const e = new Error(errCode);
    // on attache un meta utile sans typer en any
    (e as unknown as { meta?: ConsumeQuotaResult }).meta = result;
    throw e;
  }

  // ✅ Cache UI (optionnel) — sans .catch et sans any implicite
  void (async (): Promise<void> => {
    try {
      await supabaseAdmin
        .from("profiles")
        .update({
          monthly_quota_used: result.used,
          monthly_quota_limit: result.limit,
        })
        .eq("id", userId);

      logger.info("🪞 profiles cache updated (quota consume)", {
        userId,
        used: result.used,
        limit: result.limit,
      });
    } catch (err: unknown) {
      logger.warn("⚠️ profiles cache update failed (quota consume)", { userId, err });
    }
  })();

  return result;
}