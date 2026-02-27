// apps/backend/src/services/quota/consumeQuota.ts

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
 * Erreur métier quota typée
 */
export class QuotaError extends Error {
  code: string;
  meta?: ConsumeQuotaResult;

  constructor(code: string, meta?: ConsumeQuotaResult) {
    super(code);
    this.code = code;
    this.meta = meta;
  }
}

/**
 * Consomme du quota IA de façon ATOMIQUE via la RPC Postgres `consume_ai_quota`.
 * RPC attendue:
 *   consume_ai_quota(uid uuid, amt int default 1)
 * Retour:
 *   { ok, used, monthly_limit, reset_at }
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
    throw new QuotaError("quota_rpc_error");
  }

  const result = (Array.isArray(data) ? data[0] : data) as
    | ConsumeQuotaResult
    | undefined;

  if (!result) {
    throw new QuotaError("quota_rpc_empty");
  }

  if (result.ok !== true) {
    throw new QuotaError("quota_exceeded", result);
  }

  return result;
}