import { supabaseAdmin } from "../../lib/supabaseAdmin";
import { logger } from "../../utils/logger";

export type ConsumeQuotaOk = {
  ok: true;
  used: number;
  monthly_limit: number;
  reset_at: string | null;
};

export type ConsumeQuotaBlocked = {
  ok: false;
  used: number;
  monthly_limit: number;
  reset_at: string | null;
};

export type ConsumeQuotaResult = ConsumeQuotaOk | ConsumeQuotaBlocked;

export type QuotaErrorCode =
  | "quota_invalid_units"
  | "quota_rpc_error"
  | "quota_rpc_empty"
  | "quota_rpc_invalid_shape"
  | "quota_exceeded";

export class QuotaError extends Error {
  code: QuotaErrorCode;
  meta?: ConsumeQuotaResult;

  constructor(code: QuotaErrorCode, message?: string, meta?: ConsumeQuotaResult) {
    super(message ?? code);
    this.code = code;
    this.meta = meta;
  }
}

/**
 * Consomme du quota IA de façon ATOMIQUE via la RPC Postgres `consume_ai_quota`.
 *
 * ⚠️ L'impossibilité de dépasser le quota en requêtes parallèles dépend de la RPC:
 * elle doit faire un UPDATE/INSERT avec condition (ou verrou/transaction) côté Postgres.
 *
 * RPC attendue:
 *   consume_ai_quota(uid uuid, amt int default 1)
 * Retour:
 *   { ok, used, monthly_limit, reset_at }
 */
export async function consumeAiQuotaOrThrow(
  userId: string,
  units = 1
): Promise<ConsumeQuotaOk> {
  // ✅ Validation stricte des unités (évite comportements incohérents)
  if (!Number.isInteger(units) || units <= 0) {
    throw new QuotaError("quota_invalid_units", "Invalid quota units");
  }

  // ✅ Unique source de vérité: RPC atomique (aucun UPDATE local non-atomique)
  const { data, error } = await supabaseAdmin.rpc("consume_ai_quota", {
    uid: userId,
    amt: units,
  });

  if (error) {
    logger.error("❌ consume_ai_quota RPC error", {
      userId,
      message: error.message,
    });
    throw new QuotaError("quota_rpc_error", "Quota RPC error");
  }

  // Supabase RPC peut renvoyer un objet ou un tableau (selon config)
  const result = (Array.isArray(data) ? data[0] : data) as ConsumeQuotaResult | undefined;

  if (!result) {
    throw new QuotaError("quota_rpc_empty", "Quota RPC returned empty result");
  }

  // ✅ Shape minimal attendu
  if (
    typeof result.ok !== "boolean" ||
    typeof result.used !== "number" ||
    typeof result.monthly_limit !== "number" ||
    !("reset_at" in result)
  ) {
    throw new QuotaError("quota_rpc_invalid_shape", "Quota RPC returned invalid shape");
  }

  // ✅ Quota bloqué (race conditions gérées côté DB via RPC atomique)
  if (result.ok !== true) {
    throw new QuotaError("quota_exceeded", "Quota exceeded", result);
  }

  return result;
}