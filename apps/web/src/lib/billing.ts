export const ORGANISATION_TRIAL_DAYS = 90;

export type SubscriptionStatus =
  | "trialing"
  | "active"
  | "past_due"
  | "paused"
  | "cancelled";

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
