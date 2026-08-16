import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { paystackEventReference, verifyPaystackSignature } from "./paystack-webhook";

describe("Paystack webhook security", () => {
  it("accepts only the SHA-512 HMAC created from the unmodified body", () => {
    const body = JSON.stringify({ event: "subscription.create", data: { id: 42 } });
    const secret = "sk_test_a_secure_paystack_secret_for_tests";
    const signature = createHmac("sha512", secret).update(body).digest("hex");

    expect(verifyPaystackSignature(body, signature, secret)).toBe(true);
    expect(verifyPaystackSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyPaystackSignature(body, "not-a-signature", secret)).toBe(false);
  });

  it("creates a stable idempotency reference for an event payload", () => {
    expect(paystackEventReference("same-event")).toBe(paystackEventReference("same-event"));
    expect(paystackEventReference("same-event")).not.toBe(paystackEventReference("other-event"));
  });
});
