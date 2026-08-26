import { describe, expect, it } from "vitest";
import { evaluateMutationRequest } from "./request-security";

const baseRequest = {
  pathname: "/api/v1/organisations/org-1/projects/project-1/documents",
  requestOrigin: "https://app.engicite.com",
};

describe("browser mutation request security", () => {
  it("allows safe read methods without browser mutation headers", () => {
    expect(
      evaluateMutationRequest({
        ...baseRequest,
        method: "GET",
        originHeader: null,
        fetchSite: null,
      }),
    ).toEqual({ allowed: true, reason: "safe_method" });
  });

  it("allows same-origin mutations", () => {
    expect(
      evaluateMutationRequest({
        ...baseRequest,
        method: "POST",
        originHeader: "https://app.engicite.com",
        fetchSite: "same-origin",
      }),
    ).toEqual({ allowed: true, reason: "same_origin" });
  });

  it("rejects cross-origin mutations", () => {
    expect(
      evaluateMutationRequest({
        ...baseRequest,
        method: "POST",
        originHeader: "https://attacker.example",
        fetchSite: "cross-site",
      }),
    ).toEqual({ allowed: false, reason: "cross_origin" });
  });

  it("rejects cross-site mutations even without an Origin header", () => {
    expect(
      evaluateMutationRequest({
        ...baseRequest,
        method: "DELETE",
        originHeader: null,
        fetchSite: "cross-site",
      }),
    ).toEqual({ allowed: false, reason: "cross_site" });
  });

  it("fails closed when a mutation has no browser context", () => {
    expect(
      evaluateMutationRequest({
        ...baseRequest,
        method: "PATCH",
        originHeader: null,
        fetchSite: null,
      }),
    ).toEqual({ allowed: false, reason: "missing_browser_context" });
  });

  it("allows the Paystack webhook because the route verifies its signature", () => {
    expect(
      evaluateMutationRequest({
        ...baseRequest,
        method: "POST",
        pathname: "/api/v1/billing/paystack/webhook/",
        originHeader: null,
        fetchSite: null,
      }),
    ).toEqual({ allowed: true, reason: "signed_webhook" });
  });
});

