import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireBillingAdministrator, trustedBillingRequest } from "@/lib/billing-access";
import { checkoutConfiguration, stripeClient } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ organisationId: string }> }) {
  const { organisationId } = await context.params;
  if (!trustedBillingRequest(request)) {
    return Response.json({ error: { code: "UNTRUSTED_ORIGIN", message: "Billing request was rejected." } }, { status: 403 });
  }
  const access = await requireBillingAdministrator(organisationId);
  if (!access) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Only the organisation administrator can manage billing." } }, { status: 403 });
  }

  const returnUrl = new URL(`/app/${organisationId}/subscription`, request.url);
  try {
    const stripe = stripeClient();
    const configuration = checkoutConfiguration();
    const admin = createAdminClient();
    const { data: existingCustomer } = await admin
      .from("billing_customers")
      .select("id,provider_name,provider_customer_reference,provider_checkout_session_reference")
      .eq("organisation_id", organisationId)
      .maybeSingle();

    if (
      existingCustomer?.provider_name === "stripe" &&
      existingCustomer.provider_checkout_session_reference
    ) {
      const existingSession = await stripe.checkout.sessions.retrieve(
        existingCustomer.provider_checkout_session_reference,
      );
      if (existingSession.status === "open" && existingSession.url) {
        return NextResponse.redirect(existingSession.url, 303);
      }
    }

    let customerReference =
      existingCustomer?.provider_name === "stripe"
        ? existingCustomer.provider_customer_reference
        : null;
    if (!customerReference) {
      const customer = await stripe.customers.create({
        name: access.organisation.name,
        email: access.user.email,
        metadata: { organisation_id: organisationId },
      });
      customerReference = customer.id;
    }

    const { data: localSubscription } = await admin
      .from("subscriptions")
      .select("trial_ends_at,provider_subscription_reference")
      .eq("organisation_id", organisationId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (localSubscription?.provider_subscription_reference) {
      return NextResponse.redirect(new URL(`${returnUrl}?billing=already-subscribed`), 303);
    }

    const trialEnd = localSubscription?.trial_ends_at
      ? Math.floor(new Date(localSubscription.trial_ends_at).getTime() / 1000)
      : null;
    const atLeastFortyEightHoursAway = trialEnd && trialEnd > Math.floor(Date.now() / 1000) + 172_800;
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerReference,
      client_reference_id: organisationId,
      line_items: [{ price: configuration.priceId, quantity: 1 }],
      billing_address_collection: "required",
      tax_id_collection: { enabled: true },
      allow_promotion_codes: true,
      success_url: `${configuration.appUrl}/app/${organisationId}/subscription?checkout=success`,
      cancel_url: `${configuration.appUrl}/app/${organisationId}/subscription?checkout=cancelled`,
      metadata: { organisation_id: organisationId, plan_code: configuration.planCode },
      subscription_data: {
        ...(atLeastFortyEightHoursAway ? { trial_end: trialEnd } : {}),
        metadata: { organisation_id: organisationId, plan_code: configuration.planCode },
      },
    });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL.");

    const customerRecord = {
      organisation_id: organisationId,
      billing_email: access.user.email,
      provider_name: "stripe",
      provider_customer_reference: customerReference,
      provider_checkout_session_reference: session.id,
      updated_at: new Date().toISOString(),
    };
    const result = existingCustomer
      ? await admin.from("billing_customers").update(customerRecord).eq("id", existingCustomer.id)
      : await admin.from("billing_customers").insert(customerRecord);
    if (result.error) throw result.error;

    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Stripe checkout could not be created", error instanceof Error ? error.message : "unknown error");
    returnUrl.searchParams.set("billing", "checkout-unavailable");
    return NextResponse.redirect(returnUrl, 303);
  }
}
