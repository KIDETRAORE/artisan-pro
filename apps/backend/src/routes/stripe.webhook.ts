import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

const router = Router();

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {
  // apiVersion: "2024-06-20",
});

/**
 * Stripe Webhook
 * ⚠️ req.body doit être RAW (express.raw) dans app.ts
 */
router.post("/", async (req: Request, res: Response) => {
  const signatureHeader = req.headers["stripe-signature"];
  const signature = Array.isArray(signatureHeader) ? signatureHeader[0] : signatureHeader;

  if (!signature) return res.status(400).send("Missing stripe-signature header");

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("❌ Stripe signature verification failed", { message });
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  // ✅ Idempotency (Stripe retries same event)
  const alreadyProcessed = await markEventProcessed(event.id, event.type);
  if (alreadyProcessed) {
    logger.info("↩️ Stripe event already processed (idempotent skip)", {
      eventId: event.id,
      type: event.type,
    });
    return res.status(200).json({ received: true, duplicate: true });
  }

  logger.info("🔥 STRIPE EVENT", { type: event.type, eventId: event.id });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription?.id;

        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        const userId = subscription.metadata?.userId || session.metadata?.userId;
        if (!userId) {
          logger.warn("⚠️ No userId found in subscription/session metadata", {
            eventId: event.id,
            subscriptionId,
          });
          break;
        }

        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;

        await syncSubscriptionTruth(userId, subscription, customerId ?? undefined);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) {
          logger.warn("⚠️ invoice.payment_succeeded without subscription id", {
            eventId: event.id,
            invoiceId: invoice.id,
          });
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId = subscription.metadata?.userId;

        if (!userId) {
          logger.warn("⚠️ No userId found in subscription metadata (invoice.payment_succeeded)", {
            eventId: event.id,
            subscriptionId: subscription.id,
          });
          break;
        }

        await syncSubscriptionTruth(userId, subscription);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          logger.warn("⚠️ No userId found in subscription metadata (subscription.updated)", {
            eventId: event.id,
            subscriptionId: subscription.id,
          });
          break;
        }

        await syncSubscriptionTruth(userId, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) break;

        // ✅ Truth table: subscriptions
        await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan: "FREE",
              status: "canceled",
              stripe_customer_id: null,
              stripe_subscription_id: null,
              current_period_end: null,
            },
            { onConflict: "user_id" }
          );

        // ✅ Cache UI: profiles
        await supabaseAdmin
          .from("profiles")
          .update({
            plan: "FREE",
            subscription_status: "canceled",
            stripe_subscription_id: null,
            current_period_end: null,
            monthly_quota_limit: 10,
            quota_reset_at: null,
          })
          .eq("id", userId);

        logger.info("⬇️ Subscription cancelled for user", { userId });
        break;
      }

      default:
        logger.info("ℹ️ Unhandled Stripe event", { type: event.type, eventId: event.id });
    }

    return res.status(200).json({ received: true });
  } catch (err: unknown) {
    logger.error("❌ Webhook processing error", { eventId: event.id, type: event.type, err });
    return res.status(500).send("Internal Server Error");
  }
});

/**
 * Idempotency helper
 * Uses current schema: stripe_events(id text, type text, created_at timestamptz) :contentReference[oaicite:1]{index=1}
 * Returns true if already processed.
 */
async function markEventProcessed(eventId: string, type: string): Promise<boolean> {
  const { error } = await supabaseAdmin.from("stripe_events").insert({ id: eventId, type });

  if (!error) return false;

  // If insert failed, check if it already exists (treat as duplicate)
  const { data } = await supabaseAdmin
    .from("stripe_events")
    .select("id")
    .eq("id", eventId)
    .maybeSingle();

  return !!data?.id;
}

function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as any).subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object" && typeof sub.id === "string") return sub.id;
  return null;
}

function getCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const v = (subscription as any).current_period_end;
  return typeof v === "number" ? v : null;
}

/**
 * Truth sync:
 * - upsert subscriptions (source of truth)
 * - update profiles (cache UI)
 */
async function syncSubscriptionTruth(
  userId: string,
  subscription: Stripe.Subscription,
  customerId?: string
) {
  const status = subscription.status;
  const isActive = status === "active" || status === "trialing";
  const periodEnd = getCurrentPeriodEnd(subscription);

  const plan = isActive ? "PRO" : "FREE";

  // 1) Source of truth: subscriptions
  const { error: subErr } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan,
        status,
        stripe_customer_id: customerId ?? null,
        stripe_subscription_id: subscription.id,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      },
      { onConflict: "user_id" }
    );

  if (subErr) {
    logger.error("❌ Failed to upsert subscriptions (truth)", { userId, subErr });
  }

  // 2) Cache UI: profiles
  const profileUpdate: Record<string, unknown> = {
    plan,
    subscription_status: status,
    stripe_subscription_id: subscription.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    monthly_quota_limit: isActive ? 500 : 10,
    quota_reset_at: periodEnd ?? null, // garde ta convention actuelle si tu l'utilises encore
  };

  if (customerId) profileUpdate.stripe_customer_id = customerId;

  const { error: profileErr } = await supabaseAdmin
    .from("profiles")
    .update(profileUpdate)
    .eq("id", userId);

  if (profileErr) {
    logger.error("❌ Failed to update profiles cache", { userId, profileErr });
  } else {
    logger.info("🔄 Stripe sync success (truth+cache)", { userId, plan, status });
  }
}

export default router;