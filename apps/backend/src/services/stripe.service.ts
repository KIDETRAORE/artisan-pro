import Stripe from "stripe";
import { ENV } from "../config/env";

export const stripe = new Stripe(ENV.STRIPE_SECRET_KEY);
