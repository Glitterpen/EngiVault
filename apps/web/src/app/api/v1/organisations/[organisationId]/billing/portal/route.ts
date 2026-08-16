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
  if (!(await requireBillingAdministrator(organisationId))) {
    return Response.json({ error: { code: "FORBIDDEN", message: "Only the organisation administrator can manage billing." } }, { status: 403 });
  }

  const returnUrl = new URL(`/app/${organisationId}/subscription`, request.url);
  try {
    const admin = createAdminClient();
    const { data: customer } = await admin
      .from("billing_customers")
      .select("provider_customer_reference")
      .eq("organisation_id", organisationId)
      .eq("provider_name", "stripe")
      .maybeSingle();
    if (!customer?.provider_customer_reference) {
      returnUrl.searchParams.set("billing", "customer-unavailable");
      return NextResponse.redirect(returnUrl, 303);
    }
    const configuration = checkoutConfiguration();
    const session = await stripeClient().billingPortal.sessions.create({
      customer: customer.provider_customer_reference,
      return_url: `${configuration.appUrl}/app/${organisationId}/subscription`,
    });
    return NextResponse.redirect(session.url, 303);
  } catch (error) {
    console.error("Stripe portal could not be created", error instanceof Error ? error.message : "unknown error");
    returnUrl.searchParams.set("billing", "portal-unavailable");
    return NextResponse.redirect(returnUrl, 303);
  }
}
