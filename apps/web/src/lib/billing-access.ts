import "server-only";

import { requireUser } from "@/lib/auth";

export async function requireBillingAdministrator(organisationId: string) {
  const { supabase, user } = await requireUser();
  const { data } = await supabase
    .rpc("get_my_organisations")
    .eq("organisation_id", organisationId)
    .eq("role", "organisation_admin")
    .maybeSingle();
  return data ? { supabase, user, organisation: data as { organisation_id: string; name: string; role: string } } : null;
}

export function trustedBillingRequest(request: Request) {
  const origin = request.headers.get("origin");
  return Boolean(origin && origin === new URL(request.url).origin);
}
