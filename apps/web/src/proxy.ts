import { NextResponse, type NextRequest } from "next/server";
import { evaluateMutationRequest } from "@/lib/request-security";
import { refreshSession } from "@/lib/supabase/proxy";

const cookieName = "engicite_admin_preview";
const paystackWebhookPath = "/api/v1/billing/paystack/webhook";

function withSecurityResponseHeaders(response: NextResponse, requestId: string) {
  response.headers.set("Cache-Control", "private, no-store, max-age=0, must-revalidate");
  response.headers.set("X-Request-ID", requestId);
  return response;
}

export async function proxy(request: NextRequest) {
  const requestId = crypto.randomUUID();
  const decision = evaluateMutationRequest({
    method: request.method,
    pathname: request.nextUrl.pathname,
    requestOrigin: request.nextUrl.origin,
    originHeader: request.headers.get("origin"),
    fetchSite: request.headers.get("sec-fetch-site"),
  });

  if (!decision.allowed) {
    console.warn(JSON.stringify({
      event: "security.request_rejected",
      request_id: requestId,
      method: request.method,
      pathname: request.nextUrl.pathname,
      reason: decision.reason,
    }));
    return withSecurityResponseHeaders(
      NextResponse.json(
        {
          error: {
            code: "CROSS_SITE_REQUEST_REJECTED",
            message: "This request could not be verified as coming from EngiCite.",
          },
        },
        { status: 403 },
      ),
      requestId,
    );
  }

  const isSafeMethod = ["GET", "HEAD", "OPTIONS"].includes(request.method);
  const previewValue = request.cookies.get(cookieName)?.value;
  if (!isSafeMethod && previewValue) {
    const [organisationId, projectId] = previewValue.split(":");
    const projectPath = `/${organisationId}/projects/${projectId}`;
    if (request.nextUrl.pathname.includes(projectPath)) {
      console.warn(JSON.stringify({
        event: "security.preview_mutation_rejected",
        request_id: requestId,
        method: request.method,
        pathname: request.nextUrl.pathname,
      }));
      return withSecurityResponseHeaders(
        NextResponse.json(
          {
            error: {
              code: "ADMIN_PREVIEW_READ_ONLY",
              message: "Exit administrator role preview before changing project data.",
            },
          },
          { status: 423 },
        ),
        requestId,
      );
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-request-id", requestId);

  if (request.nextUrl.pathname.replace(/\/+$/, "") === paystackWebhookPath) {
    return withSecurityResponseHeaders(
      NextResponse.next({ request: { headers: requestHeaders } }),
      requestId,
    );
  }

  const response = await refreshSession(request, requestHeaders);
  return withSecurityResponseHeaders(response, requestId);
}

export const config = {
  matcher: ["/app/:path*", "/founder/:path*", "/api/v1/:path*", "/api/admin-preview/:path*"],
};
