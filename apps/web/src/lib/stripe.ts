import "server-only";

import Stripe from "stripe";
import { z } from "zod";

const checkoutSchema = z.object({
  secretKey: z.string().trim().min(20),
  priceId: z.string().trim().min(8),
  planCode: z.string().trim().min(1).max(40).default("team"),
  appUrl: z.url(),
});

let client: Stripe | undefined;

export function checkoutConfiguration() {
  return checkoutSchema.parse({
    secretKey: process.env.STRIPE_SECRET_KEY,
    priceId: process.env.STRIPE_PRICE_ID,
    planCode: process.env.STRIPE_PLAN_CODE ?? "team",
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  });
}

export function stripeClient() {
  const configuration = checkoutConfiguration();
  client ??= new Stripe(configuration.secretKey, {
    appInfo: { name: "EngiCite", version: "0.1.0" },
  });
  return client;
}

export function stripeWebhookSecret() {
  return z.string().trim().min(20).parse(process.env.STRIPE_WEBHOOK_SECRET);
}

export function isStripeCheckoutConfigured() {
  return checkoutSchema.safeParse({
    secretKey: process.env.STRIPE_SECRET_KEY,
    priceId: process.env.STRIPE_PRICE_ID,
    planCode: process.env.STRIPE_PLAN_CODE ?? "team",
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
  }).success;
}
