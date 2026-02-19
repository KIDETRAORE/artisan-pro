import { Request, Response } from "express";
import Stripe from "stripe";
import { stripe } from "../services/stripe.service";
import { requireUser } from "../utils/requireUser";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { ENV } from "../config/env";
import { updateSubscriptionData } from "../services/billing.service";

/* =====================================================
   TYPES
===================================================== */

type InvoiceWithSubscription = Stripe.Invoice & {
  subscription?: string | Stripe.Subscription | null;
};

/* =====================================================
   CREATE CHECKOUT SESSION
===================================================== */

export async function createCheckoutSession(
  req: Request,
  res: Response
) {
  const user = requireUser(req);

  if (!user?.id) {
    return res.status(401).json({ error: "User non authentifié" });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile) {
    return res.status(404).json({ error: "Profil introuvable" });
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

  return res.json({ url: session.url });
}

/* =====================================================
   CREATE PORTAL SESSION
===================================================== */

export async function createPortalSession(
  req: Request,
  res: Response
) {
  const user = requireUser(req);

  if (!user?.id) {
    return res.status(401).json({ error: "User non authentifié" });
  }

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (!profile?.stripe_customer_id) {
    return res.status(400).json({ error: "Customer Stripe introuvable" });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${ENV.FRONTEND_URL}/dashboard`,
  });

  return res.json({ url: portalSession.url });
}

/* =====================================================
   STRIPE WEBHOOK
===================================================== */

export async function stripeWebhook(
  req: Request,
  res: Response
) {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    return res.status(400).send("Missing stripe-signature");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      ENV.STRIPE_WEBHOOK_SECRET
    );
  } catch (err: any) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {

    switch (event.type) {

      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {

        const invoice = event.data.object as InvoiceWithSubscription;
        if (!invoice.subscription) break;

        const subscriptionId =
          typeof invoice.subscription === "string"
            ? invoice.subscription
            : invoice.subscription.id;

        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        ) as Stripe.Subscription;

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        const firstItem = subscription.items?.data?.[0];

        const currentPeriodEnd =
          firstItem && typeof firstItem.current_period_end === "number"
            ? firstItem.current_period_end
            : null;

        await updateSubscriptionData({
          userId,
          plan: subscription.status === "active" ? "PRO" : "FREE",
          subscriptionStatus: subscription.status,
          stripeSubscriptionId: subscription.id,
          currentPeriodEnd,
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

  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return res.sendStatus(500);
  }
}
