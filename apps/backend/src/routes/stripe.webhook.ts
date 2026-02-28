// apps/backend/src/routes/stripe.webhook.ts
import { Router, type Request, type Response } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import {
  acquireStripeEventLock,
  markStripeEventProcessed,
} from "../services/stripe/stripeIdempotency";
import { normalizePlan } from "../domain/plan"; // ✅ MODIF: helper unique
import { sendError } from "../utils/apiError";

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
  const signature = Array.isArray(signatureHeader)
    ? signatureHeader[0]
    : signatureHeader;

  if (!signature) {
    return sendError(
      req,
      res,
      400,
      "missing_stripe_signature",
      "Missing stripe-signature header"
    );
  }

  if (!Buffer.isBuffer(req.body)) {
    logger.error("Stripe webhook requires raw body (Buffer)");
    return sendError(req, res, 400, "raw_body_required", "Webhook raw body required");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      ENV.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error("Stripe signature verification failed", { message });
    return sendError(
      req,
      res,
      400,
      "invalid_signature",
      "Stripe webhook signature verification failed"
    );
  }

  const eventId = event.id;
  const eventType = event.type;
  const createdAtIso = new Date(event.created * 1000).toISOString();

  try {
    const lock = await acquireStripeEventLock({
      eventId,
      type: eventType,
      createdAt: createdAtIso,
    });

    if (lock === "already_processed") {
      logger.info("Stripe event already processed (skip)", { eventId, eventType });
      return res.status(200).json({
        received: true,
        status: "already_processed",
      });
    }

    if (lock === "processing_elsewhere") {
      logger.warn("Stripe event is being processed elsewhere (skip)", {
        eventId,
        eventType,
      });
      return res.status(200).json({
        received: true,
        status: "processing_elsewhere",
      });
    }
  } catch (err: unknown) {
    logger.error("Stripe idempotency storage error", {
      eventId,
      eventType,
      message: err instanceof Error ? err.message : String(err),
    });
    return sendError(req, res, 500, "idempotency_storage_error", "Internal Server Error");
  }

  logger.info("Stripe event received", { eventType, eventId });

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
          logger.warn("No userId found in subscription/session metadata", {
            eventId,
            subscriptionId,
          });
          break;
        }

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id;

        await syncSubscriptionTruth(userId, subscription, customerId ?? undefined);
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
          logger.warn(
            "No userId found in subscription metadata (invoice.payment_succeeded)",
            {
              eventId,
              subscriptionId: subscription.id,
            }
          );
          break;
        }

        await syncSubscriptionTruth(userId, subscription);
        break;
      }

      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) {
          logger.warn(
            "No userId found in subscription metadata (subscription.updated)",
            {
              eventId,
              subscriptionId: subscription.id,
            }
          );
          break;
        }

        await syncSubscriptionTruth(userId, subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (!userId) break;

        // ✅ MODIF: remplacer "FREE" par un plan normalisé
        const plan = normalizePlan("free");

        const { error: subErr } = await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: userId,
              plan,
              status: "canceled",
              stripe_customer_id: null,
              stripe_subscription_id: null,
              current_period_end: null,
            },
            { onConflict: "user_id" }
          );

        if (subErr) {
          logger.error("Failed to upsert subscriptions (deleted)", {
            userId,
            message: subErr.message,
          });
        }

        logger.info("Subscription cancelled for user", { userId });
        break;
      }

      default:
        logger.info("Unhandled Stripe event", { eventType, eventId });
    }

    await markStripeEventProcessed(eventId);

    return res.status(200).json({
      received: true,
      status: "processed",
    });
  } catch (err: unknown) {
    logger.error("Webhook processing error", {
      eventId,
      eventType,
      message: err instanceof Error ? err.message : String(err),
    });
    return sendError(req, res, 500, "processing_error", "Internal Server Error");
  }
});

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

async function syncSubscriptionTruth(
  userId: string,
  subscription: Stripe.Subscription,
  customerId?: string
) {
  const status = subscription.status;
  const isActive = status === "active" || status === "trialing";
  const periodEnd = getCurrentPeriodEnd(subscription);

  // ✅ MODIF: remplacer "PRO"/"FREE" par plan normalisé
  const rawPlanFromMappingOrFallback = isActive ? "pro" : "free";
  const plan = normalizePlan(rawPlanFromMappingOrFallback);

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
    logger.error("Failed to upsert subscriptions (truth)", {
      userId,
      message: subErr.message,
    });
  } else {
    logger.info("Stripe sync success (truth)", { userId, plan, status });
  }
}

export default router;