import { supabaseAdmin } from "../lib/supabaseAdmin";

export type Plan = "FREE" | "PRO";

export async function updateSubscriptionData(params: {
  userId: string;
  plan: Plan;
  subscriptionStatus: string;
  stripeSubscriptionId?: string | null;
  currentPeriodEnd?: number | null;
}) {
  const {
    userId,
    plan,
    subscriptionStatus,
    stripeSubscriptionId,
    currentPeriodEnd,
  } = params;

  const { error } = await supabaseAdmin
    .from("profiles")
    .update({
      plan,
      subscription_status: subscriptionStatus,
      stripe_subscription_id: stripeSubscriptionId ?? null,
      current_period_end: currentPeriodEnd
        ? new Date(currentPeriodEnd * 1000).toISOString()
        : null,
    })
    .eq("id", userId);

  if (error) {
    console.error("❌ updateSubscriptionData error:", error);
    throw error;
  }

  console.log(
    `✅ Subscription updated → ${userId} | ${plan} | ${subscriptionStatus}`
  );
}
