import { describe, expect, it } from "vitest";
import {
  isPasswordRecoveryCallback,
  passwordRecoveryConfirmationUrl,
  passwordRecoveryDestination,
  supportedEmailOtpType,
} from "./auth-email-callback";

describe("Supabase email callback routing", () => {
  it("accepts the documented recovery token type", () => {
    expect(supportedEmailOtpType("recovery")).toBe("recovery");
    expect(isPasswordRecoveryCallback("recovery", "/app")).toBe(true);
  });

  it("rejects an unrecognised callback type", () => {
    expect(supportedEmailOtpType("attacker-controlled")).toBeNull();
  });

  it("preserves an explicit password-update destination", () => {
    const destination = "/auth/update-password?next=%2Finvite%2F" + "a".repeat(64);
    expect(passwordRecoveryDestination(destination)).toBe(destination);
  });

  it("sends a recovery token without an explicit destination to password update", () => {
    expect(passwordRecoveryDestination("/app")).toBe("/auth/update-password?next=%2Fapp");
  });

  it("builds a non-consuming recovery confirmation URL", () => {
    expect(passwordRecoveryConfirmationUrl("https://engicite.example", "/invite/" + "a".repeat(64)))
      .toBe("https://engicite.example/auth/recover?next=%2Finvite%2F" + "a".repeat(64));
  });
});
