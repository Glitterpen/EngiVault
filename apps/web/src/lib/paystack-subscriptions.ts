import "server-only";

import { paystackSubscriptionStatus, type SubscriptionStatus } from "@/lib/billing";
import {
  fetchPaystackSubscription,
  paystackConfiguration,
  type PaystackRecord,
} from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createAdminClient>;

export async function applyPaystackTransaction(admin: AdminClient, transaction: PaystackRecord) {
  const metadata = asMetadata(transaction.metadata);
  const organisationId = text(metadata.organisation_id);
  const reference = text(transaction.reference);
  if (!isUuid(organisationId) || !reference || text(transaction.status) !== "success") {
    throw new Error("Paystack transaction is not a successful EngiCite checkout.");
  }

  const { data: billingCustomer } = await admin
    .from("billing_customers")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("provider_name", "paystack")
    .eq("provider_checkout_session_reference", reference)
    .maybeSingle();
  if (!billingCustomer) {
    const recurringSubscription = record(transaction.subscription);
    if (recurringSubscription && text(recurringSubscription.subscription_code)) {
      return applyPaystackSubscription(
        admin,
        {
          ...recurringSubscription,
          customer: recurringSubscription.customer ?? transaction.customer,
        },
        "charge.success",
      );
    }
    throw new Error("Paystack checkout reference is not bound to this organisation.");
  }

  const customer = record(transaction.customer);
  const customerReference = text(customer?.customer_code);
  if (customerReference) {
    const { error } = await admin
      .from("billing_customers")
      .update({
        provider_customer_reference: customerReference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", billingCustomer.id);
    if (error) throw error;
  }

  const subscription = record(transaction.subscription);
  if (subscription && text(subscription.subscription_code)) {
    await applyPaystackSubscription(admin, subscription, "charge.success", organisationId);
  }
  return organisationId;
}

export async function applyPaystackSubscription(
  admin: AdminClient,
  subscription: PaystackRecord,
  eventType: string,
  organisationHint?: string,
) {
  const subscriptionReference = text(subscription.subscription_code);
  if (!subscriptionReference) throw new Error("Paystack subscription code is missing.");

  const configuration = paystackConfiguration();
  let providerSubscription = subscription;
  let providerPlan = record(providerSubscription.plan);
  let providerPlanCode =
    text(providerPlan?.plan_code) ?? text(providerSubscription.plan_code);
  if (!providerPlanCode) {
    const verifiedSubscription = await fetchPaystackSubscription(subscriptionReference);
    providerSubscription = {
      ...verifiedSubscription,
      ...providerSubscription,
      customer: providerSubscription.customer ?? verifiedSubscription.customer,
      plan: providerSubscription.plan ?? verifiedSubscription.plan,
    };
    providerPlan = record(providerSubscription.plan);
    providerPlanCode =
      text(providerPlan?.plan_code) ?? text(providerSubscription.plan_code);
  }
  if (providerPlanCode !== configuration.planCode) {
    throw new Error("Paystack subscription is attached to an unexpected plan.");
  }

  const customer = record(providerSubscription.customer);
  const customerReference = text(customer?.customer_code);
  const { organisationId, billingCustomerId } = await resolveOrganisation(
    admin,
    subscriptionReference,
    customerReference,
    organisationHint,
  );

  const { data: plan } = await admin
    .from("plans")
    .select("id")
    .eq("code", configuration.localPlanCode)
    .eq("active", true)
    .maybeSingle();
  if (!plan) throw new Error("The Paystack plan is not mapped to an active EngiCite plan.");

  const { data: existing } = await admin
    .from("subscriptions")
    .select("id")
    .eq("organisation_id", organisationId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const providerStatus =
    text(providerSubscription.status) ?? statusFromEvent(eventType, providerSubscription);
  const status = controlledStatus(eventType, providerStatus, providerSubscription);
  const cancelAtPeriodEnd =
    eventType === "subscription.not_renew" || providerStatus === "non-renewing";
  const recordToSave = {
    organisation_id: organisationId,
    billing_customer_id: billingCustomerId,
    plan_id: plan.id,
    provider_name: "paystack",
    status,
    trial_ends_at: null,
    current_period_start:
      providerDate(providerSubscription.start) ?? providerDate(providerSubscription.created_at),
    current_period_end: providerDate(providerSubscription.next_payment_date),
    provider_subscription_reference: subscriptionReference,
    provider_price_reference: providerPlanCode,
    cancel_at_period_end: cancelAtPeriodEnd,
    updated_at: new Date().toISOString(),
  };
  const result = existing
    ? await admin.from("subscriptions").update(recordToSave).eq("id", existing.id)
    : await admin.from("subscriptions").insert(recordToSave);
  if (result.error) throw result.error;

  if (customerReference) {
    const { error } = await admin
      .from("billing_customers")
      .update({
        provider_name: "paystack",
        provider_customer_reference: customerReference,
        updated_at: new Date().toISOString(),
      })
      .eq("id", billingCustomerId);
    if (error) throw error;
  }

  await admin.from("audit_events").insert({
    organisation_id: organisationId,
    action: "billing.subscription_synced",
    target_type: "organisation",
    target_id: organisationId,
    outcome: "succeeded",
    changes: {
      provider: "paystack",
      status,
      plan_code: configuration.localPlanCode,
      cancel_at_period_end: cancelAtPeriodEnd,
    },
  });
  return organisationId;
}

async function resolveOrganisation(
  admin: AdminClient,
  subscriptionReference: string,
  customerReference: string | undefined,
  organisationHint?: string,
) {
  if (isUuid(organisationHint)) {
    const { data } = await admin
      .from("billing_customers")
      .select("id")
      .eq("organisation_id", organisationHint)
      .eq("provider_name", "paystack")
      .maybeSingle();
    if (data) return { organisationId: organisationHint, billingCustomerId: data.id };
  }

  const { data: existingSubscription } = await admin
    .from("subscriptions")
    .select("organisation_id,billing_customer_id")
    .eq("provider_name", "paystack")
    .eq("provider_subscription_reference", subscriptionReference)
    .maybeSingle();
  if (existingSubscription?.billing_customer_id) {
    return {
      organisationId: existingSubscription.organisation_id,
      billingCustomerId: existingSubscription.billing_customer_id,
    };
  }

  if (customerReference) {
    const { data: customer } = await admin
      .from("billing_customers")
      .select("id,organisation_id")
      .eq("provider_name", "paystack")
      .eq("provider_customer_reference", customerReference)
      .maybeSingle();
    if (customer) {
      return { organisationId: customer.organisation_id, billingCustomerId: customer.id };
    }
  }
  throw new Error("Paystack subscription could not be bound to an EngiCite organisation.");
}

function controlledStatus(
  eventType: string,
  providerStatus: string,
  subscription: PaystackRecord,
): SubscriptionStatus {
  if (eventType === "invoice.payment_failed") return "past_due";
  if (eventType === "subscription.disable") return "cancelled";
  if (eventType === "invoice.update" && subscription.paid === true) return "active";
  return paystackSubscriptionStatus(providerStatus);
}

function statusFromEvent(eventType: string, subscription: PaystackRecord) {
  if (eventType === "subscription.create" || eventType === "charge.success") return "active";
  if (eventType === "subscription.not_renew") return "non-renewing";
  if (eventType === "subscription.disable") return "cancelled";
  if (eventType === "invoice.payment_failed") return "attention";
  if (eventType === "invoice.update" && subscription.paid === true) return "active";
  return "attention";
}

function asMetadata(value: unknown): PaystackRecord {
  const objectValue = record(value);
  if (objectValue) return objectValue;
  if (typeof value !== "string" || !value.trim()) return {};
  try {
    return record(JSON.parse(value)) ?? {};
  } catch {
    return {};
  }
}

function record(value: unknown): PaystackRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as PaystackRecord)
    : undefined;
}

function text(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function providerDate(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value * 1000).toISOString();
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value);
}
