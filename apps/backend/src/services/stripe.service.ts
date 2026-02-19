import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";

export const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {
});

export class StripeService {

  /* ================================
     CHECKOUT SESSION
  ================================== */

  static async createCheckoutSession(user: {
    id: string;
    email: string;
  }) {

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

      metadata: {
        userId: user.id,
      },

      success_url: `${ENV.FRONTEND_URL}/success`,
      cancel_url: `${ENV.FRONTEND_URL}/cancel`,
    });

    return session.url;
  }

  /* ================================
     BILLING PORTAL
  ================================== */

  static async createBillingPortal(userId: string) {

    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", userId)
      .single();

    if (error || !profile?.stripe_customer_id) {
      throw new Error("No Stripe customer found");
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: ENV.FRONTEND_URL,
    });

    return portalSession.url;
  }

  /* ================================
     WEBHOOK HANDLER
  ================================== */

  static async handleWebhook(event: Stripe.Event) {

    switch (event.type) {

      case "checkout.session.completed": {

        const session = event.data.object as Stripe.Checkout.Session;

        const userId = session.metadata?.userId;
        const customerId = session.customer as string;

        if (!userId) return;

        // 🔹 Sauvegarde customer + passage PRO
        await supabaseAdmin
          .from("profiles")
          .update({
            plan: "PRO",
            stripe_customer_id: customerId,
          })
          .eq("id", userId);

        break;
      }

      case "customer.subscription.deleted": {

        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        // 🔹 Retour FREE si abonnement annulé
        await supabaseAdmin
          .from("profiles")
          .update({ plan: "FREE" })
          .eq("stripe_customer_id", customerId);

        break;
      }

      default:
        break;
    }
  }
}
