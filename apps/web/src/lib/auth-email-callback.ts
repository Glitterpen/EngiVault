import type { EmailOtpType } from "@supabase/supabase-js";

const supportedEmailOtpTypes = new Set([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email_change",
  "email",
]);

export function supportedEmailOtpType(value: string | null): EmailOtpType | null {
  return value && supportedEmailOtpTypes.has(value) ? value as EmailOtpType : null;
}

export function isPasswordRecoveryCallback(type: EmailOtpType | null, destination: string) {
  return type === "recovery" || destination.startsWith("/auth/update-password");
}

export function passwordRecoveryDestination(destination: string) {
  return destination.startsWith("/auth/update-password")
    ? destination
    : `/auth/update-password?next=${encodeURIComponent(destination)}`;
}
