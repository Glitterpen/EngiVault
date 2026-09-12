import {cookies} from "next/headers";
import {createClient} from "@/lib/supabase/server";
import {evaluateMutationRequest} from "@/lib/request-security";

// Outside the read-only preview mutation boundary: every role must be able to exit.
export async function POST(request: Request) {
  const url = new URL(request.url);
  const decision = evaluateMutationRequest({method: "POST", pathname: url.pathname,
    requestOrigin: url.origin, originHeader: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site")});
  if (!decision.allowed) return new Response(null, {status: 403});
  const client = await createClient();
  const {error} = await client.auth.signOut({scope: "local"});
  if (error) return new Response(null, {status: 503, headers: {"Cache-Control": "no-store"}});
  (await cookies()).delete("engicite_admin_preview");
  return new Response(null, {status: 204, headers: {"Cache-Control": "no-store"}});
}
