import { NextResponse } from "next/server";
import { requireBillingAdministrator, trustedBillingRequest } from "@/lib/billing-access";
import { createPaystackManageLink } from "@/lib/paystack";
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
  if (!(await requireBillingAdministrator(organisationId))) {
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
    const { data: subscription } = await createAdminClient()
      .from("subscriptions")
      .select("provider_subscription_reference")
      .eq("organisation_id", organisationId)
      .eq("provider_name", "paystack")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!subscription?.provider_subscription_reference) {
      returnUrl.searchParams.set("billing", "customer-unavailable");
      return NextResponse.redirect(returnUrl, 303);
    }
    const link = await createPaystackManageLink(subscription.provider_subscription_reference);
    return NextResponse.redirect(link, 303);
  } catch (error) {
    console.error(
      "Paystack management link could not be created",
      error instanceof Error ? error.message : "unknown error",
    );
    returnUrl.searchParams.set("billing", "portal-unavailable");
    return NextResponse.redirect(returnUrl, 303);
  }
}
