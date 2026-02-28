import Stripe from "stripe";
import { ENV } from "../config/env";
import { supabaseAdmin } from "../lib/supabaseAdmin";
import { normalizePlan } from "../domain/plan";
import { quotaService } from "./quota.service";

export const stripe = new Stripe(ENV.STRIPE_SECRET_KEY, {});

type DbPlan = "free" | "pro";

function toDbPlan(plan: string): DbPlan {
  const p = normalizePlan(plan);
  return p === "pro" ? "pro" : "free";
}

function toDbStatus(status: unknown): string {
  return typeof status === "string" ? status.toLowerCase() : "inactive";
}

async function getSubscriptionByUserId(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id,stripe_customer_id,stripe_subscription_id,plan,status,current_period_end")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

async function getSubscriptionByCustomerId(customerId: string) {
  const { data, error } = await supabaseAdmin
    .from("subscriptions")
    .select("user_id,stripe_customer_id,stripe_subscription_id,plan,status,current_period_end")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export class StripeService {
  // ✅ ne dépend pas de profiles (email vient de Supabase Auth)
  static async getOrCreateCustomer(user: { id: string; email: string }) {
    const existing = await getSubscriptionByUserId(user.id);
    if (existing?.stripe_customer_id) return existing.stripe_customer_id;

    const customer = await stripe.customers.create({
      email: user.email,
      metadata: { userId: user.id },
    });

    await StripeService.attachCustomerToUser(user.id, customer.id);
    return customer.id;
  }

  // ✅ écrit dans subscriptions (pas profiles)
  static async attachCustomerToUser(userId: string, stripeCustomerId: string) {
    const { error } = await supabaseAdmin.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_customer_id: stripeCustomerId,
      },
      { onConflict: "user_id" }
    );

    if (error) throw new Error(error.message);
  }

  static async createCheckoutSession(user: { id: string; email: string }) {
    // ✅ optionnel: créer customer Stripe + l’attacher
    const customerId = await StripeService.getOrCreateCustomer(user);

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer: customerId,
      line_items: [{ price: ENV.STRIPE_PRICE_ID, quantity: 1 }],
      metadata: { userId: user.id },
      success_url: `${ENV.FRONTEND_URL}/success`,
      cancel_url: `${ENV.FRONTEND_URL}/cancel`,
    });

    return session.url ?? null;
  }

  static async createBillingPortal(userId: string) {
    const sub = await getSubscriptionByUserId(userId);

    if (!sub?.stripe_customer_id) {
      throw new Error("No Stripe customer found");
    }

    const portalSession = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id,
      return_url: ENV.FRONTEND_URL,
    });

    return portalSession.url;
  }

  // ✅ upsert dans subscriptions (pas profiles)
  static async upsertSubscriptionFromStripe(params: {
    userId?: string;
    customerId?: string;
    stripeSubscriptionId?: string | null;
    plan: DbPlan;
    status: string;
    currentPeriodEnd?: string | null;
  }) {
    const { userId, customerId, stripeSubscriptionId, plan, status, currentPeriodEnd } = params;

    // On doit pouvoir rattacher soit par userId (checkout), soit par customerId (events subscription.*)
    if (!userId && !customerId) return;

    // si userId absent mais customerId présent, on tente de retrouver user_id via row existante
    let resolvedUserId = userId;
    if (!resolvedUserId && customerId) {
      const existing = await getSubscriptionByCustomerId(customerId);
      resolvedUserId = existing?.user_id ?? undefined;
    }

    const payload: any = {
      plan,
      status,
      stripe_customer_id: customerId ?? undefined,
      stripe_subscription_id: stripeSubscriptionId ?? undefined,
      current_period_end: currentPeriodEnd ?? null,
    };

    if (resolvedUserId) {
      payload.user_id = resolvedUserId;
      const { error } = await supabaseAdmin.from("subscriptions").upsert(payload, { onConflict: "user_id" });
      if (error) throw new Error(error.message);
      return;
    }

    // fallback: update via stripe_customer_id si on n'a pas user_id (rare)
    if (customerId) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update(payload)
        .eq("stripe_customer_id", customerId);

      if (error) throw new Error(error.message);
    }
  }

  static async handleWebhook(event: Stripe.Event) {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.userId;
        const customerId = session.customer as string | null;
        const stripeSubscriptionId = (session.subscription as string | null) ?? null;

        if (!userId) return;

        const plan = toDbPlan("pro");
        const status = "active"; // checkout completed => généralement active (le status réel vient de subscription.*)

        await StripeService.upsertSubscriptionFromStripe({
          userId,
          customerId: customerId ?? undefined,
          stripeSubscriptionId,
          plan,
          status,
          currentPeriodEnd: null,
        });

        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.created":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const customerId = subscription.customer as string | undefined;
        const stripeSubscriptionId = subscription.id ?? null;
        const status = toDbStatus(subscription.status);

        // Stripe v20: accès runtime safe
        const cpe = (subscription as any).current_period_end;
        const currentPeriodEnd =
          typeof cpe === "number" ? new Date(cpe * 1000).toISOString() : null;

        const isDeleted = event.type === "customer.subscription.deleted";

        const plan = isDeleted ? toDbPlan("free") : toDbPlan("pro");

        await StripeService.upsertSubscriptionFromStripe({
          customerId,
          stripeSubscriptionId,
          plan,
          status: isDeleted ? "canceled" : status,
          currentPeriodEnd,
        });

        // ✅ optionnel: en FREE, s'assurer que la row quota existe
        if (isDeleted) {
          const existing = customerId ? await getSubscriptionByCustomerId(customerId) : null;
          const userId = existing?.user_id;
          if (userId) {
            await quotaService.ensureQuotaRow(userId);
          }
        }

        break;
      }

      default:
        break;
    }
  }
}