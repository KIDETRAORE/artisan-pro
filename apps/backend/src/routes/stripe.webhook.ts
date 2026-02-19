import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { createClient } from "@supabase/supabase-js";

const router = Router();

const stripe = new Stripe(ENV.STRIPE_SECRET_KEY);

const supabase = createClient(
  ENV.SUPABASE_URL,
  ENV.SUPABASE_SERVICE_ROLE_KEY
);

router.post("/", async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];

  if (!signature || typeof signature !== "string") {
    return res.status(400).send("Missing stripe-signature header");
  }

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      ENV.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    if (err instanceof Error) {
      console.error("❌ Signature verification failed:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
    return res.status(400).send("Webhook Error");
  }

  console.log("🔥 EVENT:", event.type);

  try {
    switch (event.type) {

      /* ================================
         CHECKOUT COMPLETED
      ================================= */
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!session.subscription) break;

        const subscriptionId =
          typeof session.subscription === "string"
            ? session.subscription
            : session.subscription.id;

        const customerId =
          typeof session.customer === "string"
            ? session.customer
            : session.customer?.id ?? null;

        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        );

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await syncSubscription(userId, subscription, customerId);
        break;
      }

      /* ================================
         INVOICE EVENTS (Stripe v20 safe)
      ================================= */
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {

        const invoice = event.data.object as Stripe.Invoice;

        // 🔐 Stripe v20 safe access
        const subscriptionRef = (invoice as any)?.subscription;
        if (!subscriptionRef) break;

        const subscriptionId =
          typeof subscriptionRef === "string"
            ? subscriptionRef
            : subscriptionRef.id;

        const subscription = await stripe.subscriptions.retrieve(
          subscriptionId
        );

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await syncSubscription(userId, subscription);
        break;
      }

      /* ================================
         SUBSCRIPTION UPDATED
      ================================= */
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await syncSubscription(userId, subscription);
        break;
      }

      /* ================================
         SUBSCRIPTION DELETED
      ================================= */
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const userId = subscription.metadata?.userId;
        if (!userId) break;

        await supabase
          .from("profiles")
          .update({
            plan: "FREE",
            subscription_status: "canceled",
            stripe_subscription_id: null,
            current_period_end: null,
            monthly_quota_limit: 10,
            monthly_quota_used: 0,
            quota_reset_at: null,
          })
          .eq("id", userId);

        console.log("⬇ Subscription cancelled:", userId);
        break;
      }

      default:
        console.log("ℹ️ Unhandled event:", event.type);
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("❌ Webhook processing error:", error);
    return res.sendStatus(500);
  }
});

/* =====================================
   SAFE SYNC FUNCTION (Stripe v20 safe)
===================================== */

async function syncSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  customerId?: string | null
) {
  const status = subscription.status;
  const isActive = status === "active" || status === "trialing";

  // 🔐 Lecture runtime compatible Stripe v20
  const periodEnd =
    (subscription as any)?.current_period_end ??
    subscription.items?.data?.[0]?.current_period_end ??
    null;

  const updateData: Record<string, any> = {
    plan: isActive ? "PRO" : "FREE",
    subscription_status: status,
    stripe_subscription_id: subscription.id,
    current_period_end: periodEnd
      ? new Date(periodEnd * 1000).toISOString()
      : null,
    monthly_quota_limit: isActive ? 500 : 10,
    quota_reset_at: periodEnd,
  };

  if (!isActive) {
    updateData.monthly_quota_used = 0;
  }

  if (customerId) {
    updateData.stripe_customer_id = customerId;
  }

  await supabase
    .from("profiles")
    .update(updateData)
    .eq("id", userId);

  console.log(
    `🔄 Sync → ${userId} | status=${status} | plan=${isActive ? "PRO" : "FREE"}`
  );
}

export default router;
