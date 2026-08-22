import { describe, expect, it } from "vitest";
import {
  ORGANISATION_TRIAL_DAYS,
  paystackSubscriptionStatus,
  trialDaysRemaining,
} from "./billing";

describe("organisation billing", () => {
  it("keeps the pilot card-free for three months", () => {
    expect(ORGANISATION_TRIAL_DAYS).toBe(90);
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
});
