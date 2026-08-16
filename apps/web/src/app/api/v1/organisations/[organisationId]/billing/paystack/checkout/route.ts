import { NextResponse } from "next/server";
import { requireBillingAdministrator, trustedBillingRequest } from "@/lib/billing-access";
import { initializePaystackSubscription } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ organisationId: string }> },
) {
  const { organisationId } = await context.params;
  if (!trustedBillingRequest(request)) {
    return Response.json(
      { error: { code: "UNTRUSTED_ORIGIN", message: "Billing request was rejected." } },
      { status: 403 },
    );
  }
  const access = await requireBillingAdministrator(organisationId);
  if (!access) {
    return Response.json(
      {
        error: {
          code: "FORBIDDEN",
          message: "Only the organisation administrator can manage billing.",
        },
      },
      { status: 403 },
    );
  }

  const returnUrl = new URL(`/app/${organisationId}/subscription`, request.url);
  try {
    if (!access.user.email) throw new Error("The billing administrator has no verified email.");
    const admin = createAdminClient();
    const { data: localSubscription } = await admin
      .from("subscriptions")
      .select("status,trial_ends_at,provider_subscription_reference")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (localSubscription?.provider_subscription_reference) {
      return NextResponse.redirect(new URL(`${returnUrl}?billing=already-subscribed`), 303);
    }
    if (
      localSubscription?.status === "trialing" &&
      localSubscription.trial_ends_at &&
      new Date(localSubscription.trial_ends_at).getTime() > Date.now()
    ) {
      return NextResponse.redirect(new URL(`${returnUrl}?billing=paystack-after-trial`), 303);
    }

    const { data: existingCustomer } = await admin
      .from("billing_customers")
      .select("id,provider_name,provider_customer_reference")
      .eq("organisation_id", organisationId)
      .maybeSingle();
    const checkout = await initializePaystackSubscription({
      email: access.user.email,
      organisationId,
    });
    const customerRecord = {
      organisation_id: organisationId,
      billing_email: access.user.email,
      provider_name: "paystack",
      provider_customer_reference:
        existingCustomer?.provider_name === "paystack"
          ? existingCustomer.provider_customer_reference
          : null,
      provider_checkout_session_reference: checkout.reference,
      updated_at: new Date().toISOString(),
    };
    const result = existingCustomer
      ? await admin.from("billing_customers").update(customerRecord).eq("id", existingCustomer.id)
      : await admin.from("billing_customers").insert(customerRecord);
    if (result.error) throw result.error;

    await admin.from("audit_events").insert({
      organisation_id: organisationId,
      actor_user_id: access.user.id,
      action: "billing.checkout_started",
      target_type: "organisation",
      target_id: organisationId,
      outcome: "succeeded",
      changes: { provider: "paystack" },
    });
    return NextResponse.redirect(checkout.authorization_url, 303);
  } catch (error) {
    console.error(
      "Paystack checkout could not be created",
      error instanceof Error ? error.message : "unknown error",
    );
    returnUrl.searchParams.set("billing", "paystack-unavailable");
    return NextResponse.redirect(returnUrl, 303);
  }
}
