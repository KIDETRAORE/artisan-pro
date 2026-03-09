// apps/backend/src/services/userUsage.service.ts
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

function monthDateUTC(d = new Date()): string {
  // YYYY-MM-01 (stable)
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${year}-${month}-01`;
}

/**
 * Increment monthly analyses counter (analytics).
 * - No throw (never blocks main flow).
 * - Uses upsert + unique(user_id, month_date).
 */
export async function incrementMonthlyAnalyses(
  userId: string,
  delta = 1,
  at = new Date()
): Promise<void> {
  try {
    const month_date = monthDateUTC(at);

    // Read existing row (cheap) then upsert increment.
    // (PostgREST doesn't support "increment" directly on conflict)
    const { data: existing, error: readErr } = await supabaseAdmin
      .from("user_usage")
      .select("analyses_count")
      .eq("user_id", userId)
      .eq("month_date", month_date)
      .maybeSingle();

    if (readErr) throw readErr;

    const next = (existing?.analyses_count ?? 0) + delta;

    const { error: upsertErr } = await supabaseAdmin
      .from("user_usage")
      .upsert(
        { user_id: userId, month_date, analyses_count: next },
        { onConflict: "user_id,month_date" }
      );

    if (upsertErr) throw upsertErr;
  } catch (err: unknown) {
    logger.warn("[USER_USAGE] increment failed (non-blocking)", {
      userId,
      message: err instanceof Error ? err.message : String(err),
    });
  }
}