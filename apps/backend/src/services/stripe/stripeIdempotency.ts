// apps/backend/src/services/stripe/stripeIdempotency.ts
import { supabaseAdmin } from "../../lib/supabaseAdmin";

export type StripeEventLockResult =
  | "acquired"
  | "already_processed"
  | "processing_elsewhere";

/**
 * Idempotence persistante (multi-instances)
 * Utilise stripe_events (id = event.id Stripe, type, created_at, processed_at)
 */
export async function acquireStripeEventLock(args: {
  eventId: string;
  type: string;
  createdAt: string;
}): Promise<StripeEventLockResult> {
  const { error: insErr } = await supabaseAdmin.from("stripe_events").insert({
    id: args.eventId,
    type: args.type,
    created_at: args.createdAt,
    processed_at: null,
  });

  if (!insErr) return "acquired";

  const code = (insErr as unknown as { code?: string }).code;
  if (code !== "23505") {
    throw new Error(`stripe_events_insert_failed:${insErr.message}`);
  }

  // Duplicate : on regarde processed_at
  const { data, error: selErr } = await supabaseAdmin
    .from("stripe_events")
    .select("processed_at")
    .eq("id", args.eventId)
    .maybeSingle();

  if (selErr) throw new Error(`stripe_events_select_failed:${selErr.message}`);

  if (data?.processed_at) return "already_processed";
  return "processing_elsewhere";
}

export async function markStripeEventProcessed(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    throw new Error(`stripe_events_update_failed:${error.message}`);
  }
}