import type { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import { requireUser } from "../utils/requireUser";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { ENV } from "../config/env";
import { updateSubscriptionData } from "../services/billing.service";
import { logger } from "../utils/logger";
import { HttpError } from "../utils/httpError";

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
  if (!user?.id) throw new HttpError(401, "Unauthorized");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile) {
    logger.warn("Stripe checkout: profil introuvable", { userId: user.id });
    throw new HttpError(404, "Profil introuvable");
  }

  let customerId = profile.stripe_customer_id ?? null;

  if (!customerId) {
    const customer = await stripe.customers.create({
      email: profile.email ?? undefined,
      metadata: { userId: user.id },
    });

    customerId = customer.id;

    const { error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", user.id);

    if (updateError) {
      logger.error("Stripe checkout: impossible de sauvegarder stripe_customer_id", {
        userId: user.id,
        message: updateError.message,
      });
      throw new HttpError(500, "Erreur interne");
    }
  }

  // ✅ price_id whitelist
  const priceId = ENV.STRIPE_PRICE_ID;
  if (!priceId || !ALLOWED_PRICE_IDS.has(priceId)) {
    logger.error("Stripe checkout: price_id non autorisé ou manquant", { userId: user.id });
    throw new HttpError(500, "Configuration Stripe invalide");
  }

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { userId: user.id },
    subscription_data: { metadata: { userId: user.id } },
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
  if (!user?.id) throw new HttpError(401, "Unauthorized");

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (profileError || !profile?.stripe_customer_id) {
    throw new HttpError(400, "Customer Stripe introuvable");
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
    // ✅ ne pas trop détailler
    return res.status(400).send("Webhook Error");
  }

  let event: Stripe.Event;

  try {
    // IMPORTANT: req.body doit être RAW (Buffer) via express.raw dans app.ts
    event = stripe.webhooks.constructEvent(req.body, sig, ENV.STRIPE_WEBHOOK_SECRET);
  } catch (err: unknown) {
    // ✅ log minimal (pas d'objet complet, pas de stack)
    logger.warn("Stripe webhook: signature invalide", {
      message: err instanceof Error ? err.message : "invalid signature",
    });
    // ✅ ne jamais renvoyer err.message au client
    return res.status(400).send("Webhook Error");
  }

  // ✅ Idempotency fallback (best effort)
  if (alreadySeen(event.id)) {
    return res.status(200).json({ received: true, dedup: true });
  }

  try {
    switch (event.type) {
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;

        // Stripe v20: invoice.subscription est union → runtime access
        const subscriptionRef = (invoice as any).subscription as string | Stripe.Subscription | null | undefined;
        if (!subscriptionRef) break;

        const subscriptionId =
          typeof subscriptionRef === "string" ? subscriptionRef : subscriptionRef.id;

        const subscription = (await stripe.subscriptions.retrieve(subscriptionId)) as Stripe.Subscription;

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const firstItem = subscription.items?.data?.[0];
        const priceId = firstItem?.price?.id ? String(firstItem.price.id) : null;

        // ✅ whitelist
        if (priceId && !ALLOWED_PRICE_IDS.has(priceId)) {
          logger.error("Stripe webhook: price_id non autorisé", {
            userId,
            priceId,
            eventId: event.id,
          });
          break; // on n'upgrade pas, mais on ne fail pas le webhook
        }

        const mappedPlan = priceId ? PRICE_TO_PLAN[priceId] : undefined;
        const plan = isActive(subscription.status) && mappedPlan === "PRO" ? "PRO" : "FREE";

        // ✅ current_period_end est sur Subscription (runtime-safe)
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
        break;
    }

    return res.json({ received: true });
  } catch (err: unknown) {
    logger.error("Stripe webhook: processing error", {
      eventId: event.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return res.sendStatus(500);
  }
}