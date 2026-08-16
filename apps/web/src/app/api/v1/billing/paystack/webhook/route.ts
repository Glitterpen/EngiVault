import { z } from "zod";
import { paystackConfiguration, type PaystackRecord } from "@/lib/paystack";
import {
  applyPaystackSubscription,
  applyPaystackTransaction,
} from "@/lib/paystack-subscriptions";
import { paystackEventReference, verifyPaystackSignature } from "@/lib/paystack-webhook";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const eventSchema = z.object({
  event: z.string().min(1),
  data: z.record(z.string(), z.unknown()),
});

export async function POST(request: Request) {
  const signature = request.headers.get("x-paystack-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const rawBody = await request.text();
  let secretKey: string;
  try {
    secretKey = paystackConfiguration().secretKey;
  } catch {
    return new Response("Payment provider is not configured", { status: 503 });
  }
  if (!verifyPaystackSignature(rawBody, signature, secretKey)) {
    return new Response("Invalid signature", { status: 400 });
  }

  let event: z.infer<typeof eventSchema>;
  try {
    event = eventSchema.parse(JSON.parse(rawBody));
  } catch {
    return new Response("Invalid event", { status: 400 });
  }

  const admin = createAdminClient();
  const providerEventReference = paystackEventReference(rawBody);
  const { data: processed } = await admin
    .from("billing_webhook_events")
    .select("id")
    .eq("provider_name", "paystack")
    .eq("provider_event_reference", providerEventReference)
    .maybeSingle();
  if (processed) return Response.json({ received: true, duplicate: true });

  try {
    await processEvent(event.event, event.data, admin);
    const { error } = await admin.from("billing_webhook_events").insert({
      provider_name: "paystack",
      provider_event_reference: providerEventReference,
      event_type: event.event,
      livemode: event.data.domain === "live",
    });
    if (error && error.code !== "23505") throw error;
    return Response.json({ received: true });
  } catch (error) {
    console.error(
      "Paystack webhook processing failed",
      event.event,
      error instanceof Error ? error.message : "unknown error",
    );
    return new Response("Webhook processing failed", { status: 500 });
  }
}

async function processEvent(
  eventType: string,
  data: PaystackRecord,
  admin: ReturnType<typeof createAdminClient>,
) {
  if (eventType === "charge.success") {
    const organisationId = metadataOrganisation(data.metadata);
    if (organisationId) {
      await applyPaystackTransaction(admin, data);
    } else {
      const subscription = record(data.subscription);
      if (subscription) {
        await applyPaystackSubscription(
          admin,
          { ...subscription, customer: subscription.customer ?? data.customer },
          eventType,
        );
      }
    }
    return;
  }
  if (
    eventType === "subscription.create" ||
    eventType === "subscription.not_renew" ||
    eventType === "subscription.disable"
  ) {
    await applyPaystackSubscription(admin, data, eventType);
    return;
  }
  if (eventType === "invoice.payment_failed" || eventType === "invoice.update") {
    const subscription = record(data.subscription);
    if (subscription) {
      await applyPaystackSubscription(
        admin,
        {
          ...subscription,
          customer: subscription.customer ?? data.customer,
          paid: data.paid,
          next_payment_date: subscription.next_payment_date ?? data.period_end,
        },
        eventType,
      );
    }
  }
}

function metadataOrganisation(value: unknown) {
  const metadata = record(value) ?? parseMetadata(value);
  const organisationId = metadata?.organisation_id;
  return typeof organisationId === "string" && /^[0-9a-f-]{36}$/i.test(organisationId)
    ? organisationId
    : undefined;
}

function parseMetadata(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return undefined;
  try {
    return record(JSON.parse(value));
  } catch {
    return undefined;
  }
}

function record(value: unknown): PaystackRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as PaystackRecord)
    : undefined;
}
