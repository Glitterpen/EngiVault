export const ORGANISATION_TRIAL_DAYS = 30;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled";

export function localSubscriptionStatus(providerStatus: string): SubscriptionStatus {
  switch (providerStatus) {
    case "trialing":
      return "trialing";
    case "active":
      return "active";
    case "paused":
      return "paused";
    case "canceled":
    case "incomplete_expired":
      return "cancelled";
    case "past_due":
    case "incomplete":
    case "unpaid":
    default:
      return "past_due";
  }
}

export function paystackSubscriptionStatus(providerStatus: string): SubscriptionStatus {
  switch (providerStatus) {
    case "active":
    case "non-renewing":
      return "active";
    case "attention":
      return "past_due";
    case "completed":
    case "cancelled":
    case "disabled":
      return "cancelled";
    default:
      return "past_due";
  }
}

export function trialDaysRemaining(trialEndsAt: string | null, now = new Date()): number {
  if (!trialEndsAt) return 0;
  const remaining = new Date(trialEndsAt).getTime() - now.getTime();
  return Math.max(0, Math.ceil(remaining / 86_400_000));
}

export function fromUnixTime(value: number | null | undefined): string | null {
  return value ? new Date(value * 1000).toISOString() : null;
}
