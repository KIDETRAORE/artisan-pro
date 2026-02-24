// apps/backend/src/routes/stripe.routes.ts
import { Router } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { authMiddleware } from "@middlewares/auth.middleware";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";

const router = Router();

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {
  // apiVersion: "2024-06-20",
});

/**
 * 1) CREATE CHECKOUT SESSION (PRO)
 */
router.post("/create-checkout-session", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ success: false, error: "Non authentifié" });
    if (!user.email) return res.status(400).json({ success: false, error: "Email utilisateur manquant" });

    // ✅ Try reuse existing Stripe customer (source: subscriptions, fallback: profiles cache)
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let stripeCustomerId = sub?.stripe_customer_id ?? null;

    if (!stripeCustomerId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle();

      stripeCustomerId = profile?.stripe_customer_id ?? null;
    }

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: stripeCustomerId ?? undefined,
      customer_email: stripeCustomerId ? undefined : user.email, // only if no customer
      line_items: [{ price: ENV.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: {
        metadata: {
          userId: user.id, // 🔥 used by webhook
        },
      },
      success_url: `${ENV.FRONTEND_URL}/dashboard?success=true`,
      cancel_url: `${ENV.FRONTEND_URL}/dashboard?canceled=true`,
    });

    return res.status(200).json({ success: true, url: session.url });
  } catch (error: any) {
    logger.error("Stripe checkout error", error);
    return res.status(500).json({ success: false, error: "Erreur création session Stripe" });
  }
});

/**
 * 2) CREATE BILLING PORTAL SESSION
 * - Source of truth: subscriptions.stripe_customer_id
 * - Fallback: profiles cache
 */
router.post("/portal", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) return res.status(401).json({ success: false, error: "Non authentifié" });

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    let customerId = sub?.stripe_customer_id ?? null;

    if (!customerId) {
      const { data: profile, error: profErr } = await supabaseAdmin
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .maybeSingle();

      customerId = profile?.stripe_customer_id ?? null;

      // If both missing, the user likely never completed checkout
      if (!customerId) {
        logger.warn("No Stripe customer id found for portal", { userId: user.id, subErr, profErr });
        return res.status(400).json({ success: false, error: "Aucun customer Stripe trouvé" });
      }
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${ENV.FRONTEND_URL}/dashboard`,
    });

    return res.status(200).json({ success: true, url: portalSession.url });
  } catch (error: any) {
    logger.error("Stripe portal error", error);
    return res.status(500).json({ success: false, error: "Erreur création portail Stripe" });
  }
});

export default router;