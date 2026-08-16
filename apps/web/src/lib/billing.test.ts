import { describe, expect, it } from "vitest";
import {
  fromUnixTime,
  localSubscriptionStatus,
  paystackSubscriptionStatus,
  trialDaysRemaining,
} from "./billing";

describe("organisation billing", () => {
  it("maps Stripe states into controlled EngiCite states", () => {
    expect(localSubscriptionStatus("trialing")).toBe("trialing");
    expect(localSubscriptionStatus("active")).toBe("active");
    expect(localSubscriptionStatus("past_due")).toBe("past_due");
    expect(localSubscriptionStatus("canceled")).toBe("cancelled");
    expect(localSubscriptionStatus("incomplete_expired")).toBe("cancelled");
  });

  it("maps Paystack states into controlled EngiCite states", () => {
    expect(paystackSubscriptionStatus("active")).toBe("active");
    expect(paystackSubscriptionStatus("non-renewing")).toBe("active");
    expect(paystackSubscriptionStatus("attention")).toBe("past_due");
    expect(paystackSubscriptionStatus("completed")).toBe("cancelled");
    expect(paystackSubscriptionStatus("cancelled")).toBe("cancelled");
  });

  it("calculates whole trial days without returning a negative number", () => {
    const now = new Date("2026-08-16T12:00:00Z");
    expect(trialDaysRemaining("2026-08-18T11:59:00Z", now)).toBe(2);
    expect(trialDaysRemaining("2026-08-15T12:00:00Z", now)).toBe(0);
  });

  it("converts provider timestamps to ISO dates", () => {
    expect(fromUnixTime(1_787_000_000)).toBe("2026-08-17T20:53:20.000Z");
    expect(fromUnixTime(null)).toBeNull();
  });
});
