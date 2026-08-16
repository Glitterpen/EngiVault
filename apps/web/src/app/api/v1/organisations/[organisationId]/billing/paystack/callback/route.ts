import { NextResponse } from "next/server";
import { applyPaystackTransaction } from "@/lib/paystack-subscriptions";
import { verifyPaystackTransaction } from "@/lib/paystack";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ organisationId: string }> },
) {
  const { organisationId } = await context.params;
  const reference = new URL(request.url).searchParams.get("reference");
  const returnUrl = new URL(`/app/${organisationId}/subscription`, request.url);
  if (!reference || reference.length > 160) {
    returnUrl.searchParams.set("billing", "paystack-verification");
    return NextResponse.redirect(returnUrl, 303);
  }

  try {
    const transaction = await verifyPaystackTransaction(reference);
    const verifiedOrganisationId = await applyPaystackTransaction(
      createAdminClient(),
      transaction,
    );
    if (verifiedOrganisationId !== organisationId) {
      throw new Error("Paystack callback organisation does not match the verified transaction.");
    }
    returnUrl.searchParams.set("checkout", "paystack-success");
  } catch (error) {
    console.error(
      "Paystack callback could not be verified",
      error instanceof Error ? error.message : "unknown error",
    );
    returnUrl.searchParams.set("billing", "paystack-verification");
  }
  return NextResponse.redirect(returnUrl, 303);
}
