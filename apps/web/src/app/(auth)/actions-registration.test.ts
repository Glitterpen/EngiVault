import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { register, resendVerification } from "./actions";
import {
  ACCOUNT_USE_ACKNOWLEDGEMENT_FIELD as acknowledgementField,
  ACCOUNT_USE_ACKNOWLEDGEMENT_VERSION as currentVersion,
  REGISTRATION_DECLARATION_FIELD as declarationField,
  REGISTRATION_DECLARATIONS as declarations,
} from "@/lib/account-use-acknowledgement";

const provider = vi.hoisted(() => ({
  createClient: vi.fn(),
  signUp: vi.fn(),
  resend: vi.fn(),
  rpc: vi.fn(),
  maybeSingle: vi.fn(),
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: provider.createClient }));

const token = "a".repeat(64);
const invitationPath = `/invite/${token}`;
const acceptedAt = "2026-11-15T12:00:00.000Z";
const workEmail = "synthetic@example.test";

function declarationValue(invited: boolean) {
  return declarations[invited ? "invitation" : "organisation"].value;
}

function registration(invitation: boolean) {
  const form = new FormData();
  form.set("name", "Synthetic User");
  form.set("email", workEmail);
  form.set("password", "synthetic-test-password");
  form.set("captchaToken", "synthetic-captcha-token");
  if (invitation) {
    form.set("next", invitationPath);
  } else {
    form.set("organisationName", "Synthetic Engineering");
    form.set("organisationSlug", "synthetic-engineering");
  }
  return form;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY", "synthetic-site-key");
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://engicite.example.test");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(acceptedAt));
  provider.createClient.mockResolvedValue({
    auth: { signUp: provider.signUp, resend: provider.resend },
    rpc: provider.rpc,
  });
  provider.signUp.mockResolvedValue({ data: { session: null }, error: null });
  provider.resend.mockResolvedValue({ error: null });
  provider.rpc.mockReturnValue({ maybeSingle: provider.maybeSingle });
  provider.maybeSingle.mockResolvedValue({
    data: { organisation_name: "Synthetic Engineering", project_name: "Synthetic Project" },
    error: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe.each([false, true])("account-use gate (invited account: %s)", (invited) => {
  it.each([
    [], [""], ["on"], ["account-use-v1"], ["registration-policy-v1"], ["registration-policy-v2"], [currentVersion, currentVersion], ["on", currentVersion],
  ].map(values => ({ values })))("rejects missing, stale or ambiguous confirmation: $values", async ({ values }) => {
    const form = registration(invited);
    form.set(declarationField, declarationValue(invited));
    for (const value of values) form.append(acknowledgementField, value);
    const state = await register(undefined, form);
    expect(state?.errors?.[acknowledgementField]?.[0]).toMatch(/acknowledge the current Policy/);
    expect(state?.errors?.[declarationField]).toBeUndefined();
    expect(provider.createClient).not.toHaveBeenCalled();
    expect(provider.signUp).not.toHaveBeenCalled();
  });

  it.each([
    [], ["on"], [invited ? "named-invitee-v1" : "organisation-authority-v1"], ["other-audience"], ["duplicate"],
  ].map(values => ({ values })))("requires the current declaration for this route: $values", async ({ values }) => {
    const form = registration(invited);
    form.set(acknowledgementField, currentVersion);
    for (const value of values) {
      if (value === "duplicate") {
        form.append(declarationField, declarationValue(invited));
        form.append(declarationField, declarationValue(invited));
      } else {
        form.append(declarationField, value === "other-audience" ? declarationValue(!invited) : value);
      }
    }
    const state = await register(undefined, form);
    expect(state?.errors?.[declarationField]?.[0]).toMatch(/confirm.*declaration/i);
    expect(state?.errors?.[acknowledgementField]).toBeUndefined();
    expect(provider.createClient).not.toHaveBeenCalled();
    expect(provider.signUp).not.toHaveBeenCalled();
  });

  it("keeps the existing signup path and stamps server-selected versions and time", async () => {
    const form = registration(invited);
    form.set(acknowledgementField, currentVersion);
    form.set(declarationField, declarationValue(invited));
    form.set("account_use_acknowledged_at", "2000-01-01T00:00:00.000Z");
    form.set("account_use_acknowledgement_version", "client-supplied-version");
    form.set("registration_declaration_version", "client-supplied-version");
    const state = await register(undefined, form);
    const callback = new URL("/auth/callback", "https://engicite.example.test");
    callback.searchParams.set("next", invited ? invitationPath : "/organisation/setup");
    expect(provider.signUp).toHaveBeenCalledExactlyOnceWith({
      email: workEmail,
      password: "synthetic-test-password",
      options: {
        data: {
          display_name: "Synthetic User",
          ...(invited ? {
            onboarding_mode: "project_invitation",
            inviting_organisation_name: "Synthetic Engineering",
            inviting_project_name: "Synthetic Project",
          } : {
            onboarding_mode: "organisation",
            organisation_name: "Synthetic Engineering",
            organisation_slug: "synthetic-engineering",
          }),
          account_use_acknowledgement_version: currentVersion,
          account_use_acknowledged_at: acceptedAt,
          registration_declaration_version: declarationValue(invited),
        },
        emailRedirectTo: callback.toString(),
        captchaToken: "synthetic-captcha-token",
      },
    });
    if (invited) {
      expect(provider.rpc).toHaveBeenCalledExactlyOnceWith("get_project_invitation_registration_context", {
        raw_token: token, candidate_email: workEmail,
      });
    } else {
      expect(provider.rpc).not.toHaveBeenCalled();
    }
    expect(state).toMatchObject({ showResend: true, showLogin: true });
  });
});

it("does not bypass CAPTCHA or the invitation check even with a valid acknowledgement", async () => {
  const form = registration(true);
  form.set(acknowledgementField, currentVersion);
  form.set(declarationField, declarationValue(true));
  form.delete("captchaToken");
  expect((await register(undefined, form))?.message).toMatch(/security verification/);
  expect(provider.createClient).not.toHaveBeenCalled();

  form.set("captchaToken", "synthetic-captcha-token");
  provider.maybeSingle.mockResolvedValue({ data: null, error: null });
  expect((await register(undefined, form))?.message).toMatch(/requires an active invitation/);
  expect(provider.signUp).not.toHaveBeenCalled();
});

it("lets existing users request verification without agreeing again", async () => {
  const form = new FormData();
  form.set("email", workEmail);
  form.set("captchaToken", "synthetic-captcha-token");
  expect((await resendVerification(undefined, form))?.showResend).toBe(true);
  expect(provider.resend).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ type: "signup", email: workEmail }));
  expect(provider.signUp).not.toHaveBeenCalled();
});
