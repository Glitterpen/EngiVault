import "server-only";

import type Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { fromUnixTime, localSubscriptionStatus } from "@/lib/billing";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function applyStripeSubscription(admin: AdminClient, subscription: Stripe.Subscription) {
  const organisationId = subscription.metadata.organisation_id;
  const planCode = subscription.metadata.plan_code || "team";
  if (!organisationId || !/^[0-9a-f-]{36}$/i.test(organisationId)) {
    throw new Error("Stripe subscription is missing its organisation binding.");
  }

  const customerReference = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const [{ data: customer }, { data: plan }, { data: existing }] = await Promise.all([
    admin
      .from("billing_customers")
      .select("id")
      .eq("organisation_id", organisationId)
      .maybeSingle(),
    admin.from("plans").select("id").eq("code", planCode).eq("active", true).maybeSingle(),
    admin
      .from("subscriptions")
      .select("id")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!plan) throw new Error("The Stripe plan is not mapped to an active EngiCite plan.");

  let billingCustomerId = customer?.id;
  if (!billingCustomerId) {
    const { data: created, error } = await admin
      .from("billing_customers")
      .insert({
        organisation_id: organisationId,
        provider_name: "stripe",
        provider_customer_reference: customerReference,
      })
      .select("id")
      .single();
    if (error) throw error;
    billingCustomerId = created.id;
  } else {
    const { error } = await admin
      .from("billing_customers")
      .update({
        provider_name: "stripe",
        provider_customer_reference: customerReference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", billingCustomerId);
    if (error) throw error;
  }

  const item = subscription.items.data[0];
  const record = {
    organisation_id: organisationId,
    billing_customer_id: billingCustomerId,
    plan_id: plan.id,
    provider_name: "stripe",
    status: localSubscriptionStatus(subscription.status),
    trial_ends_at: fromUnixTime(subscription.trial_end),
    current_period_start: fromUnixTime(item?.current_period_start),
    current_period_end: fromUnixTime(item?.current_period_end),
    provider_subscription_reference: subscription.id,
    provider_price_reference: item?.price.id ?? null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };

  const result = existing
    ? await admin.from("subscriptions").update(record).eq("id", existing.id)
    : await admin.from("subscriptions").insert(record);
  if (result.error) throw result.error;

  await admin.from("audit_events").insert({
    organisation_id: organisationId,
    action: "billing.subscription_synced",
    target_type: "organisation",
    target_id: organisationId,
    outcome: "succeeded",
    changes: {
      provider: "stripe",
      status: record.status,
      plan_code: planCode,
      cancel_at_period_end: record.cancel_at_period_end,
    },
  });
}
