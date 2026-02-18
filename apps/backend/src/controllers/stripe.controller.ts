import { Request, Response } from "express";
import { stripe } from "../services/stripe.service";
import { requireUser } from "../utils/requireUser";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { ENV } from "../config/env";
import { setUserPlan } from "../services/billing.service";

/**
 * =====================================
 * POST /stripe/create-checkout-session
 * =====================================
 */
export async function createCheckoutSession(
  req: Request,
  res: Response
) {
  const user = requireUser(req);

  if (!user?.id) {
    return res.status(401).json({ error: "User non authentifié" });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("email, stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
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

/**
 * =====================================
 * POST /stripe/create-portal-session
 * =====================================
 */
export async function createPortalSession(
  req: Request,
  res: Response
) {
  const user = requireUser(req);

  if (!user?.id) {
    return res.status(401).json({ error: "User non authentifié" });
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("stripe_customer_id")
    .eq("id", user.id)
    .single();

  if (error || !profile?.stripe_customer_id) {
    return res.status(400).json({ error: "Customer Stripe introuvable" });
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${ENV.FRONTEND_URL}/dashboard`,
  });

  return res.json({ url: portalSession.url });
}

/**
 * =====================================
 * POST /stripe/webhook
 * =====================================
 */
export async function stripeWebhook(
  req: Request,
  res: Response
) {
  const sig = req.headers["stripe-signature"] as string;

  if (!sig) {
    return res.status(400).send("Missing stripe-signature");
  }

  let event;

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

      case "invoice.payment_succeeded": {
        const invoice = event.data.object as any;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription
        );

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await setUserPlan(userId, "PRO");
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as any;
        if (!invoice.subscription) break;

        const subscription = await stripe.subscriptions.retrieve(
          invoice.subscription
        );

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await setUserPlan(userId, "FREE");
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as any;

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await setUserPlan(userId, "FREE");
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
