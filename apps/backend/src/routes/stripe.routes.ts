import { Router } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { verifySupabaseToken } from "../middlewares/verifySupabaseToken";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {
});

// 🔐 Supabase service role (backend only)
const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * ================================
 * 1️⃣ CREATE CHECKOUT SESSION (PRO)
 * ================================
 */
router.post(
  "/create-checkout-session",
  verifySupabaseToken,
  async (req, res) => {
    try {
      const user = req.user!;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        payment_method_types: ["card"],
        customer_email: user.email,
        line_items: [
          {
            price: ENV.STRIPE_PRICE_ID,
            quantity: 1,
          },
        ],
        subscription_data: {
          metadata: {
            userId: user.id, // 🔥 important pour le webhook
          },
        },
        success_url: `${ENV.FRONTEND_URL}/dashboard?success=true`,
        cancel_url: `${ENV.FRONTEND_URL}/dashboard?canceled=true`,
      });

      return res.status(200).json({ url: session.url });

    } catch (error) {
      console.error("Stripe checkout error:", error);
      return res.status(500).json({
        message: "Erreur création session Stripe",
      });
    }
  }
);

/**
 * ================================
 * 2️⃣ CREATE BILLING PORTAL SESSION
 * ================================
 */
router.post(
  "/portal",
  verifySupabaseToken,
  async (req, res) => {
    try {
      const user = req.user!;

      // 🔎 1. Récupérer stripe_customer_id depuis Supabase
      const { data: profile, error } = await supabase
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .single();

      if (error || !profile?.stripe_customer_id) {
        return res.status(400).json({
          message: "Aucun customer Stripe trouvé",
        });
      }

      // 🔐 2. Créer session portail Stripe
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: profile.stripe_customer_id,
        return_url: `${ENV.FRONTEND_URL}/dashboard`,
      });

      return res.status(200).json({
        url: portalSession.url,
      });

    } catch (error) {
      console.error("Stripe portal error:", error);
      return res.status(500).json({
        message: "Erreur création portail Stripe",
      });
    }
  }
);

export default router;
