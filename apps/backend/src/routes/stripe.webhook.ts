// apps/backend/src/routes/stripe.webhook.ts
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

  if (!Buffer.isBuffer(req.body)) {
    logger.error("Stripe webhook requires raw body (Buffer)");
    return res.status(400).send("Webhook Error: raw body required");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(req.body, signature, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Stripe signature verification failed", { message });
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  const eventId = event.id;
  const eventType = event.type;
  const createdAtIso = new Date(event.created * 1000).toISOString();

  // ✅ Idempotence "vraie prod" multi-instances
  try {
    const lock = await acquireStripeEventLock({
      eventId,
      type: eventType,
      createdAt: createdAtIso,
    });

    if (lock === "already_processed") {
      logger.info("Stripe event already processed (skip)", { eventId, eventType });
      return res.status(200).json({ received: true, duplicate: true });
    }

    if (lock === "processing_elsewhere") {
      logger.warn("Stripe event is being processed elsewhere (retry later)", { eventId, eventType });
      return res.status(500).send("Processing in progress, retry later");
    }
  } catch (err: unknown) {
    logger.error("Stripe idempotency storage error", {
      eventId,
      eventType,
      message: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).send("Internal Server Error");
  }

  logger.info("Stripe event received", { eventType, eventId });

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        const subscriptionId =
          typeof session.subscription === "string" ? session.subscription : session.subscription?.id;

        if (!subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);

        // userId depuis metadata subscription OU session OU client_reference_id
        const userId =
          subscription.metadata?.userId ||
          session.metadata?.userId ||
          (typeof session.client_reference_id === "string" ? session.client_reference_id : undefined);

        if (!userId) {
          logger.warn("No userId found in subscription/session metadata", {
            eventId,
            subscriptionId,
          });
          break;
        }

        const customerId =
          typeof session.customer === "string" ? session.customer : session.customer?.id;

        await upsertSubscriptionTruth(userId, subscription, customerId ?? undefined);
        break;
      }

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as Stripe.Invoice;

        const subId = getInvoiceSubscriptionId(invoice);
        if (!subId) {
          logger.warn("invoice.payment_succeeded without subscription id", {
            eventId,
            invoiceId: invoice.id,
          });
          break;
        }

        const subscription = await stripe.subscriptions.retrieve(subId);
        const userId = subscription.metadata?.userId;

        if (!userId) {
          logger.warn("No userId found in subscription metadata (invoice.payment_succeeded)", {
            eventId,
            subscriptionId: subscription.id,
          });
          break;
        }

        const customerId = getInvoiceCustomerId(invoice) ?? undefined;

        await upsertSubscriptionTruth(userId, subscription, customerId);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          logger.warn("No userId found in subscription metadata (subscription.updated)", {
            eventId,
            subscriptionId: subscription.id,
          });
          break;
        }

        await upsertSubscriptionTruth(userId, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) break;

        const { error } = await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan: "free",
              status: "canceled",
              stripe_customer_id: null,
              stripe_subscription_id: null,
              current_period_end: null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );

        if (error) {
          logger.error("Failed to upsert subscriptions (deleted)", {
            userId,
            message: error.message,
          });
        } else {
          logger.info("Subscription cancelled for user (subscriptions truth)", { userId });
        }

        break;
      }

      default:
        logger.info("Unhandled Stripe event", { eventType, eventId });
    }

    // ✅ Mark processed uniquement si traitement OK
    await markStripeEventProcessed(eventId);

    return res.status(200).json({ received: true });
  } catch (err: unknown) {
    logger.error("Webhook processing error", {
      eventId,
      eventType,
      message: err instanceof Error ? err.message : String(err),
    });
    return res.status(500).send("Internal Server Error");
  }
});

/**
 * Idempotence persistante (multi-instances)
 * Utilise stripe_events (id + event_id + processed_at).
 */
async function acquireStripeEventLock(args: {
  eventId: string;
  type: string;
  createdAt: string;
}): Promise<"acquired" | "already_processed" | "processing_elsewhere"> {
  const { error: insErr } = await supabaseAdmin.from("stripe_events").insert({
    id: args.eventId,
    event_id: args.eventId,
    type: args.type,
    created_at: args.createdAt,
    processed_at: null,
  });

  if (!insErr) return "acquired";

  const code = (insErr as unknown as { code?: string }).code;
  if (code !== "23505") {
    throw new Error(`stripe_events_insert_failed:${insErr.message}`);
  }

  const { data, error: selErr } = await supabaseAdmin
    .from("stripe_events")
    .select("processed_at")
    .eq("id", args.eventId)
    .maybeSingle();

  if (selErr) throw new Error(`stripe_events_select_failed:${selErr.message}`);

  if (data?.processed_at) return "already_processed";
  return "processing_elsewhere";
}

async function markStripeEventProcessed(eventId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("stripe_events")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", eventId);

  if (error) {
    throw new Error(`stripe_events_update_failed:${error.message}`);
  }
}

/**
 * Stripe v20: invoice.subscription est union type -> runtime access
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const sub = (invoice as any).subscription;
  if (typeof sub === "string") return sub;
  if (sub && typeof sub === "object" && typeof sub.id === "string") return sub.id;
  return null;
}

function getInvoiceCustomerId(invoice: Stripe.Invoice): string | null {
  const c = (invoice as any).customer;
  if (typeof c === "string") return c;
  if (c && typeof c === "object" && typeof c.id === "string") return c.id;
  return null;
}

/**
 * Stripe v20: current_period_end runtime
 */
function getCurrentPeriodEnd(subscription: Stripe.Subscription): number | null {
  const v = (subscription as any).current_period_end;
  return typeof v === "number" ? v : null;
}

/**
 * ✅ Source de vérité: subscriptions (1 row / user_id)
 * ⚠️ Ne met plus à jour profiles (on enlève la duplication Stripe/quota)
 */
async function upsertSubscriptionTruth(
  userId: string,
  subscription: Stripe.Subscription,
  customerId?: string
) {
  const status = subscription.status;
  const isActive = status === "active" || status === "trialing";
  const periodEnd = getCurrentPeriodEnd(subscription);

  const plan = isActive ? "pro" : "free";

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        plan,
        status,
        stripe_customer_id: customerId ?? null,
        stripe_subscription_id: subscription.id,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (error) {
    logger.error("Failed to upsert subscriptions (truth)", {
      userId,
      message: error.message,
    });
  } else {
    logger.info("Stripe sync success (subscriptions truth)", { userId, plan, status });
  }
}

export default router;