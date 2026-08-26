const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

const externallySignedMutationPaths = new Set([
  "/api/v1/billing/paystack/webhook",
]);

export type MutationRequestDecision =
  | { allowed: true; reason: "safe_method" | "same_origin" | "signed_webhook" }
  | {
      allowed: false;
      reason: "cross_origin" | "cross_site" | "missing_browser_context";
    };

function normalisePathname(pathname: string) {
  const trimmed = pathname.replace(/\/+$/, "");
  return trimmed || "/";
}

export function evaluateMutationRequest(input: {
  method: string;
  pathname: string;
  requestOrigin: string;
  originHeader: string | null;
  fetchSite: string | null;
}): MutationRequestDecision {
  const method = input.method.toUpperCase();
  if (safeMethods.has(method)) return { allowed: true, reason: "safe_method" };

  if (externallySignedMutationPaths.has(normalisePathname(input.pathname))) {
    return { allowed: true, reason: "signed_webhook" };
  }

  if (input.originHeader && input.originHeader !== input.requestOrigin) {
    return { allowed: false, reason: "cross_origin" };
  }

  if (input.fetchSite && input.fetchSite !== "same-origin") {
    return { allowed: false, reason: "cross_site" };
  }

  if (!input.originHeader && !input.fetchSite) {
    return { allowed: false, reason: "missing_browser_context" };
  }

  return { allowed: true, reason: "same_origin" };
}

