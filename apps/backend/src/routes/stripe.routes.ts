// apps/backend/src/routes/stripe.routes.ts
import { Router } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { authMiddleware } from "@middlewares/auth.middleware";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { logger } from "../utils/logger";
import { sendError } from "../utils/apiError";

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
    if (!user?.id) {
      return sendError(req, res, 401, "unauthorized", "Non authentifié");
    }
    if (!user.email) {
      return sendError(req, res, 400, "missing_email", "Email utilisateur manquant");
    }

    // ✅ Source of truth: subscriptions.stripe_customer_id (no profiles fallback)
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const stripeCustomerId = sub?.stripe_customer_id ?? null;

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
    return sendError(
      req,
      res,
      500,
      "stripe_checkout_failed",
      "Erreur création session Stripe"
    );
  }
});

/**
 * 2) CREATE BILLING PORTAL SESSION
 * - Source of truth: subscriptions.stripe_customer_id
 */
router.post("/portal", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user?.id) {
      return sendError(req, res, 401, "unauthorized", "Non authentifié");
    }

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const customerId = sub?.stripe_customer_id ?? null;

    if (!customerId) {
      return sendError(
        req,
        res,
        404,
        "stripe_customer_not_found",
        "stripe_customer_not_found"
      );
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${ENV.FRONTEND_URL}/dashboard`,
    });

    return res.status(200).json({ success: true, url: portalSession.url });
  } catch (error: any) {
    logger.error("Stripe portal error", error);
    return sendError(
      req,
      res,
      500,
      "stripe_portal_failed",
      "Erreur création portail Stripe"
    );
  }
});

export default router;