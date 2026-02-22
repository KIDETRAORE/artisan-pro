import { Router, Request, Response } from "express";
import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin"; // Utilisation du client admin centralisé
import { logger } from "../utils/logger";

const router = Router();
const stripe = new Stripe(ENV.STRIPE_SECRET_KEY!);

router.post("/", async (req: Request, res: Response) => {
  const signature = req.headers["stripe-signature"];

  if (!signature) {
    return res.status(400).send("Missing stripe-signature header");
  }

  let event: Stripe.Event;

  try {
    // Note: req.body doit être au format RAW pour Stripe (configuré dans app.ts)
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      ENV.STRIPE_WEBHOOK_SECRET!
    );
  } catch (err: any) {
    logger.error(`❌ Signature verification failed: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  logger.info(`🔥 STRIPE EVENT: ${event.type}`);

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        if (!session.subscription) break;

        const subscriptionId = typeof session.subscription === "string" 
          ? session.subscription 
          : session.subscription.id;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const userId = subscription.metadata?.userId || session.metadata?.userId;
        
        if (!userId) {
          logger.warn("⚠️ No userId found in session/subscription metadata");
          break;
        }

        await syncSubscription(userId, subscription, session.customer as string);
        break;
      }

      case "invoice.payment_succeeded":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;
        // Si c'est un invoice, on récupère la subscription liée
        const subId = typeof event.data.object === 'object' && 'subscription' in event.data.object 
          ? (event.data.object as any).subscription 
          : (event.data.object as Stripe.Subscription).id;

        const fullSubscription = await stripe.subscriptions.retrieve(subId as string);
        const userId = fullSubscription.metadata?.userId;
        
        if (userId) {
          await syncSubscription(userId, fullSubscription);
        }
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.userId;

        if (userId) {
          await supabaseAdmin
            .from("profiles")
            .update({
              plan: "FREE",
              subscription_status: "canceled",
              stripe_subscription_id: null,
              current_period_end: null,
              monthly_quota_limit: 10,
              quota_reset_at: null,
            })
            .eq("id", userId);
          logger.info(`⬇️ Subscription cancelled for user: ${userId}`);
        }
        break;
      }

      default:
        logger.info(`ℹ️ Unhandled event: ${event.type}`);
    }

    return res.status(200).json({ received: true });
  } catch (error: any) {
    logger.error("❌ Webhook processing error:", error);
    return res.status(500).send("Internal Server Error");
  }
});

/**
 * Synchronise les données Stripe avec le profil Supabase
 */
async function syncSubscription(
  userId: string,
  subscription: Stripe.Subscription,
  customerId?: string
) {
  const status = subscription.status;
  const isActive = status === "active" || status === "trialing";
  
  // Utilisation d'un accès sécurisé pour TypeScript
  const periodEnd = (subscription as any).current_period_end as number;

  const updateData: any = {
    plan: isActive ? "PRO" : "FREE",
    subscription_status: status,
    stripe_subscription_id: subscription.id,
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    monthly_quota_limit: isActive ? 500 : 10,
    quota_reset_at: periodEnd || null,
  };

  if (customerId) {
    updateData.stripe_customer_id = customerId;
  }

  const { error } = await supabaseAdmin
    .from("profiles")
    .update(updateData)
    .eq("id", userId);

  if (error) {
    logger.error(`❌ Sync Error for ${userId}:`, error);
  } else {
    logger.info(`🔄 Sync Success → User: ${userId} | Plan: ${updateData.plan}`);
  }
}

export default router;