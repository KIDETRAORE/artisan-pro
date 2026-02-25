import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { logger } from "../../utils/logger";

export type ConsumeQuotaOk = {
  ok: true;
  used: number;
  monthly_limit: number;
  reset_at: string | null;
};

export type ConsumeQuotaErr = {
  ok: false;
  used: number;
  monthly_limit: number;
  reset_at: string | null;
};

export type ConsumeQuotaResult = ConsumeQuotaOk | ConsumeQuotaErr;

/**
 * Consomme du quota IA de façon ATOMIQUE via la RPC Postgres `consume_ai_quota`.
 * RPC attendue:
 *   consume_ai_quota(uid uuid, amt int default 1)
 * Retour:
 *   { ok, used, monthly_limit, reset_at }
 *
 * - units = nombre d'unités à consommer (poids feature)
 * - met à jour profiles (cache UI) en best-effort (non bloquant)
 */
export async function consumeAiQuotaOrThrow(
  userId: string,
  units = 1
): Promise<ConsumeQuotaOk> {
  const { data, error } = await supabaseAdmin.rpc("consume_ai_quota", {
    uid: userId,
    amt: units,
  });

  if (error) {
    logger.error("❌ consume_ai_quota RPC error", {
      userId,
      message: error.message,
    });
    throw new Error("quota_rpc_error");
  }

  // Supabase RPC peut renvoyer un objet ou un tableau (selon config)
  const result = (Array.isArray(data) ? data[0] : data) as ConsumeQuotaResult | undefined;

  if (!result) {
    throw new Error("quota_rpc_empty");
  }

  if (result.ok !== true) {
    const e = new Error("quota_exceeded");
    (e as unknown as { meta?: ConsumeQuotaResult }).meta = result;
    throw e;
  }

  // ✅ Cache UI (optionnel) — best effort
  void (async (): Promise<void> => {
    try {
      await supabaseAdmin
        .from("profiles")
        .update({
          monthly_quota_used: result.used,
          monthly_quota_limit: result.monthly_limit,
        })
        .eq("id", userId);

      logger.info("🪞 profiles cache updated (quota consume)", {
        userId,
        used: result.used,
        monthly_limit: result.monthly_limit,
      });
    } catch (err: unknown) {
      logger.warn("⚠️ profiles cache update failed (quota consume)", {
        userId,
        err,
      });
    }
  })();

  return result;
}