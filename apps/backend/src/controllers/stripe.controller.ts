import type { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import { requireUser } from "../utils/requireUser";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { ENV } from "../config/env";
import { updateSubscriptionData } from "../services/billing.service";
import { logger } from "../utils/logger";

/* =====================================================
   TYPES
===================================================== */

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

/* =====================================================
   PRICE / PLAN SECURITY
===================================================== */

/**
 * Whitelist des price_id autorisés
 * ⚠️ Ajoute ici tes autres prices si tu proposes plusieurs plans
 */
const ALLOWED_PRICE_IDS = new Set<string>([ENV.STRIPE_PRICE_ID]);

/**
 * Mapping strict price_id -> plan interne
 * (ici: un seul price PRO)
 */
const PRICE_TO_PLAN: Record<string, "PRO"> = {
  [ENV.STRIPE_PRICE_ID]: "PRO",
};

function isActive(status: Stripe.Subscription.Status) {
  return status === "active" || status === "trialing";
}

/* =====================================================
   IDEMPOTENCY (fallback)
===================================================== */

/**
 * Idempotency best-effort sans table stripe_events dédiée :
 * - Cache mémoire des event.id déjà vus (évite double process si Stripe retry court)
 * - En prod multi-instance, c'est “best effort” (la vraie solution est DB)
 */
const seenEvents = new Map<string, number>(); // eventId -> expireAtMs
const EVENT_TTL_MS = 10 * 60 * 1000; // 10 min

function alreadySeen(eventId: string): boolean {
  const now = Date.now();

  // clean lazy
  for (const [id, exp] of seenEvents) {
    if (exp <= now) seenEvents.delete(id);
  }

  const exp = seenEvents.get(eventId);
  if (exp && exp > now) return true;

  seenEvents.set(eventId, now + EVENT_TTL_MS);
  return false;
}

/* =====================================================
   CREATE CHECKOUT SESSION
===================================================== */

export async function createCheckoutSession(req: Request, res: Response) {
  const user = requireUser(req);

  if (!user?.id) {
    return res.status(401).json({ success: false, error: "User non authentifié" });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return res.status(404).json({ success: false, error: "Profil introuvable" });
  }

  let customerId = profile.stripe_customer_id;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email,
      metadata: { userId: user.id },
    });

    customerId = customer.id;

    await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);
  }

  // ✅ price_id whitelist (checkout)
  if (!ALLOWED_PRICE_IDS.has(ENV.STRIPE_PRICE_ID)) {
    logger.error("Stripe price_id not allowed (misconfig)", { priceId: ENV.STRIPE_PRICE_ID });
    return res.status(500).json({ success: false, error: "Configuration Stripe invalide" });
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [
      {
        price: ENV.STRIPE_PRICE_ID,
        quantity: 1,
      },
    ],
    metadata: { userId: user.id },
    subscription_data: {
      metadata: { userId: user.id },
    },
    success_url: `${ENV.FRONTEND_URL}/dashboard?success=true`,
    cancel_url: `${ENV.FRONTEND_URL}/dashboard?canceled=true`,
  });

  return res.json({ success: true, url: session.url });
}

/* =====================================================
   CREATE PORTAL SESSION
===================================================== */

export async function createPortalSession(req: Request, res: Response) {
  const user = requireUser(req);

  if (!user?.id) {
    return res.status(401).json({ success: false, error: "User non authentifié" });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ success: false, error: "Customer Stripe introuvable" });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${ENV.FRONTEND_URL}/dashboard`,
  });

  return res.json({ success: true, url: portalSession.url });
}

/* =====================================================
   STRIPE WEBHOOK (raw body + signature)
===================================================== */

export async function stripeWebhook(req: Request, res: Response) {
  const sig = req.headers["stripe-signature"] as string | undefined;

  if (!sig) {
    return res.status(400).send("Missing stripe-signature");
  }

  let event: Stripe.Event;

  try {
    // IMPORTANT: req.body doit être RAW (Buffer) via express.raw dans app.ts
    event = stripe.webhooks.constructEvent(req.body, sig, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "invalid signature";
    logger.warn("Stripe webhook signature verification failed", { message });
    return res.status(400).send(`Webhook Error: ${message}`);
  }

  // ✅ Idempotency fallback (best effort)
  if (alreadySeen(event.id)) {
    return res.status(200).json({ received: true, dedup: true });
  }

  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as InvoiceWithSubscription;
        if (!invoice.subscription) break;

        const subscriptionId =
          typeof invoice.subscription === "string" ? invoice.subscription : invoice.subscription.id;

        const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        // ✅ price whitelist + mapping plan sécurisé
        const priceId = subscription.items?.data?.[0]?.price?.id
          ? String(subscription.items.data[0].price.id)
          : null;

        if (priceId && !ALLOWED_PRICE_IDS.has(priceId)) {
          logger.error("Unauthorized Stripe price_id in subscription", { userId, priceId, eventId: event.id });
          break; // on ne casse pas le webhook, mais on n'upgrade pas
        }

        const mappedPlan = priceId ? PRICE_TO_PLAN[priceId] : undefined;
        const plan = isActive(subscription.status) && mappedPlan === "PRO" ? "PRO" : "FREE";

        // ✅ current_period_end sur subscription (Stripe) (runtime-safe)
        const currentPeriodEnd = (subscription as any).current_period_end as number | null | undefined;

        await updateSubscriptionData({
          userId,
          plan,
          subscriptionStatus: subscription.status,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd: typeof currentPeriodEnd === "number" ? currentPeriodEnd : null,
        });

        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await updateSubscriptionData({
          userId,
          plan: "FREE",
          subscriptionStatus: subscription.status,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd: null,
        });

        break;
      }

      default:
        // ok: ignore
        break;
    }

    return res.json({ received: true });
  } catch (error: unknown) {
    logger.error("❌ Webhook processing error", { eventId: event.id, error });
    return res.sendStatus(500);
  }
}