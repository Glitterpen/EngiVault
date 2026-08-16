import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { applyStripeSubscription } from "@/lib/stripe-subscriptions";
import { stripeClient, stripeWebhookSecret } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    event = stripeClient().webhooks.constructEvent(
      await request.text(),
      signature,
      stripeWebhookSecret(),
    );
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  const admin = createAdminClient();
  const { data: processed } = await admin
    .from("billing_webhook_events")
    .select("id")
    .eq("provider_name", "stripe")
    .eq("provider_event_reference", event.id)
    .maybeSingle();
  if (processed) return Response.json({ received: true, duplicate: true });

  try {
    await processEvent(event, admin);
    const { error } = await admin.from("billing_webhook_events").insert({
      provider_name: "stripe",
      provider_event_reference: event.id,
      event_type: event.type,
      livemode: event.livemode,
    });
    if (error && error.code !== "23505") throw error;
    return Response.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing failed", event.type, error instanceof Error ? error.message : "unknown error");
    return new Response("Webhook processing failed", { status: 500 });
  }
}

async function processEvent(event: Stripe.Event, admin: ReturnType<typeof createAdminClient>) {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object;
      if (typeof session.subscription === "string") {
        const subscription = await stripeClient().subscriptions.retrieve(session.subscription);
        await applyStripeSubscription(admin, subscription);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await applyStripeSubscription(admin, event.data.object);
      break;
    default:
      break;
  }
}
