// @vitest-environment node
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readAdminPreview } from "@/lib/admin-preview";
import { requireAuthenticatedUser, requireUser } from "@/lib/auth";
import type { OrganisationVerification } from "@/lib/organisation-verification";
import AppHome from "@/app/app/page";
import OrganisationSetupPage from "./page";
import { submitOrganisationVerification, withdrawOrganisationVerification } from "./verification-actions";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => { throw new Error(`redirect:${path}`); }), revalidatePath: vi.fn(),
}));
vi.mock("next/navigation", () => ({ redirect: navigation.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: navigation.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireAuthenticatedUser: vi.fn(), requireUser: vi.fn() }));
vi.mock("@/lib/admin-preview", () => ({ readAdminPreview: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/components/organisation-logo", () => ({ OrganisationLogo: () => null }));
vi.mock("@/components/organisation-create-form", () => ({
  OrganisationCreateForm: ({ initialName, initialSlug, lockIdentity, restoreExisting }: {
    initialName: string; initialSlug: string; lockIdentity?: boolean; restoreExisting?: boolean;
  }) => <form aria-label={restoreExisting ? "Restore existing workspace" : "Create organisation"} data-identity-locked={!!lockIdentity}>{initialName} {initialSlug}</form>,
}));

const workEmail = "worker@example.test";
const emailConfirmedAt = "2026-11-01T10:00:00.000Z";
const requestId = "82000000-0000-4000-8000-000000000002";
const workspaces = [{ organisation_id: "82000000-0000-4000-8000-000000000003", name: "Existing Engineering", slug: "existing-engineering", role: "organisation_admin" }];
const request = {
  id: requestId, applicant_name: "Jamie Applicant", organisation_name: "Verified Engineering", organisation_slug: "verified-engineering",
  claimed_domain: "example.test", work_email: workEmail, status: "approved", submitted_at: "2026-11-01T10:00:00.000Z",
  decided_at: "2026-11-02T10:00:00.000Z", expires_at: "2099-11-16T10:00:00.000Z", workspace_id: null,
} satisfies OrganisationVerification;

type SetupFixture = {
  confirmed?: boolean; email?: string; onboardingMode?: string; organisations?: typeof workspaces; projectRoles?: string[];
  recoverable?: boolean; current?: unknown; statusError?: boolean; submitError?: string; withdrawError?: boolean;
};

function signedIn({
  confirmed = true, email = workEmail, onboardingMode = "organisation", organisations = [], projectRoles = [],
  recoverable = false, current = null, statusError = false, submitError, withdrawError = false,
}: SetupFixture = {}) {
  const rpc = vi.fn(async (name: string) => {
    switch (name) {
      case "get_my_organisations": return { data: organisations, error: null };
      case "has_recoverable_created_organisation": return { data: recoverable, error: null };
      case "get_my_organisation_verification": return { data: current, error: statusError ? { code: "private-service-error" } : null };
      case "submit_organisation_verification": return submitError ? { data: null, error: { code: submitError, message: "private-service-error" } } : { data: requestId, error: null };
      case "withdraw_organisation_verification": return { data: null, error: withdrawError ? { code: "42501", message: "private-service-error" } : null };
      default: throw new Error(`Unexpected RPC: ${name}`);
    }
  });
  const user = { email, email_confirmed_at: confirmed ? emailConfirmedAt : null, user_metadata: {
    email_verified: true, onboarding_mode: onboardingMode, display_name: "Jamie Signup", organisation_name: "Requested Engineering", organisation_slug: "requested-engineering",
  } };
  const supabase = { rpc, from: vi.fn(() => ({ select: () => ({ limit: async () => ({ data: projectRoles.map(role => ({ role })), error: null }) }) })) };
  vi.mocked(requireAuthenticatedUser).mockResolvedValue({ user, supabase } as never);
  vi.mocked(requireUser).mockResolvedValue({ user, supabase } as never);
  return { rpc };
}

function requestForm() {
  const form = new FormData();
  form.set("applicant_name", " Jamie Applicant ");
  form.set("organisation_name", " Verified Engineering ");
  form.set("organisation_slug", "VERIFIED-ENGINEERING");
  form.set("claimed_domain", "EXAMPLE.TEST");
  return form;
}

function withdrawalForm(id = requestId) {
  const form = new FormData();
  form.set("target_request", id);
  return form;
}

beforeEach(() => { vi.clearAllMocks(); vi.mocked(readAdminPreview).mockResolvedValue(null); });

describe("organisation verification setup", () => {
  it("requires verified work email before showing the application or creation form", async () => {
    const { rpc } = signedIn({ confirmed: false });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain("Verify your work email");
    expect(markup).toContain("/login?next=%2Forganisation%2Fsetup");
    expect(markup).not.toContain('aria-label="Request organisation verification"');
    expect(markup).not.toContain('aria-label="Create organisation"');
    expect(rpc).not.toHaveBeenCalledWith("get_my_organisation_verification");
  });

  it("prefills a verified applicant’s request while leaving workspace creation unavailable", async () => {
    signedIn();
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain('aria-label="Request organisation verification"');
    expect(markup).toContain("Requested Engineering");
    expect(markup).toContain("requested-engineering");
    expect(markup).toContain("authorised representative");
    expect(markup).not.toContain('aria-label="Create organisation"');
  });

  it("shows pending status without another request or an activation control", async () => {
    signedIn({ current: { ...request, status: "pending", decided_at: null, expires_at: null } });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain("Pending organisation verification");
    expect(markup).toContain("Refresh status");
    expect(markup).not.toContain('aria-label="Request organisation verification"');
    expect(markup).not.toContain('aria-label="Create organisation"');
  });

  it("shows activation only with the exact approved name and address, not signup metadata", async () => {
    signedIn({ current: request });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain("Organisation verified");
    expect(markup).toContain('aria-label="Create organisation" data-identity-locked="true"');
    expect(markup).toContain("Verified Engineering verified-engineering");
    expect(markup).not.toContain("Requested Engineering");
  });

  it.each([
    request,
    { ...request, status: "pending", decided_at: null, expires_at: null },
  ])("requires opening a disclosure before confirming withdrawal", async (current) => {
    signedIn({ current });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toMatch(/<details class="[^"]*"><summary[^>]*>Withdraw this request<\/summary>/);
    expect(markup).toContain('aria-label="Withdraw organisation verification"');
    expect(markup).toContain('aria-describedby="withdraw-verification-description"');
    expect(markup).toContain("Confirm withdrawal");
  });

  it("lets applicants resubmit after withdrawal without rendering activation or withdrawal", async () => {
    signedIn({ current: { ...request, status: "withdrawn", expires_at: null } });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain("You withdrew this request");
    expect(markup).toContain('aria-label="Request organisation verification"');
    expect(markup).not.toContain('aria-label="Create organisation"');
    expect(markup).not.toContain('aria-label="Withdraw organisation verification"');
  });

  it.each([
    { ...request, status: "expired", expires_at: "2020-01-01T10:00:00.000Z" },
    { ...request, expires_at: null },
    { ...request, work_email: "old@example.test" },
    { ...request, status: "rejected", expires_at: null },
  ])("keeps an old, changed-email, or declined request from activating", async (current) => {
    signedIn({ current });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).not.toContain('aria-label="Create organisation"');
    expect(markup).not.toContain('aria-label="Withdraw organisation verification"');
    expect(markup).toContain('aria-label="Request organisation verification"');
  });

  it("fails closed when it cannot confirm the current status", async () => {
    signedIn({ current: request, statusError: true });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain("Verification status unavailable");
    expect(markup).not.toContain('aria-label="Create organisation"');
    expect(markup).not.toContain("private-service-error");
  });

  it("lets existing organisation admins request a new workspace without affecting memberships", async () => {
    signedIn({ organisations: workspaces, onboardingMode: "complete" });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain('aria-label="Request organisation verification"');
    expect(markup).toContain("Back to your organisations");
    const home = renderToStaticMarkup(await AppHome());
    expect(home).toContain("Existing Engineering");
    expect(home).toContain('href="/organisation/setup"');
    expect(home).not.toContain('aria-label="Create organisation"');
  });

  it("continues to let a former owner restore an eligible workspace without creating a new one", async () => {
    const { rpc } = signedIn({ recoverable: true, onboardingMode: "complete" });
    const markup = renderToStaticMarkup(await OrganisationSetupPage());
    expect(markup).toContain('aria-label="Restore existing workspace"');
    expect(markup).not.toContain('aria-label="Create organisation"');
    expect(rpc).not.toHaveBeenCalledWith("submit_organisation_verification", expect.anything());
  });

  it("redirects project members without offering the organisation request on their home page", async () => {
    signedIn({ organisations: workspaces.map(item => ({ ...item, role: "member" })), onboardingMode: "project_invitation" });
    await expect(OrganisationSetupPage()).rejects.toThrow("redirect:/app");
    expect(renderToStaticMarkup(await AppHome())).not.toContain('href="/organisation/setup"');
  });
});

describe("organisation verification submission", () => {
  it("submits only validated claim details, not applicant-supplied approval or email", async () => {
    const { rpc } = signedIn();
    const form = requestForm();
    form.set("work_email", "fake@example.test");
    form.set("status", "approved");
    await expect(submitOrganisationVerification(undefined, form)).rejects.toThrow("redirect:/organisation/setup");
    expect(rpc).toHaveBeenCalledWith("submit_organisation_verification", {
      applicant_name: "Jamie Applicant", organisation_name: "Verified Engineering", organisation_slug: "verified-engineering", claimed_domain: "example.test",
    });
    expect(navigation.revalidatePath).toHaveBeenCalledWith("/organisation/setup");
  });

  it.each([{ confirmed: false }, { projectRoles: ["engineer"] }])("rejects direct submissions that fail the role or work-email gate", async (fixture) => {
    const { rpc } = signedIn(fixture);
    expect((await submitOrganisationVerification(undefined, requestForm()))?.message).toBeTruthy();
    expect(rpc).not.toHaveBeenCalledWith("submit_organisation_verification", expect.anything());
  });

  it("blocks audited preview at both entry points", async () => {
    const { rpc } = signedIn({ organisations: workspaces });
    vi.mocked(readAdminPreview).mockResolvedValue({ role: "project_admin" } as never);
    expect(renderToStaticMarkup(await OrganisationSetupPage())).toContain("unavailable in preview");
    expect(renderToStaticMarkup(await AppHome())).not.toContain('href="/organisation/setup"');
    expect((await submitOrganisationVerification(undefined, requestForm()))?.message).toContain("cannot request");
    expect(rpc).not.toHaveBeenCalledWith("submit_organisation_verification", expect.anything());
  });

  it("does not expose private details of an existing pending request error", async () => {
    signedIn({ submitError: "55000" });
    const response = await submitOrganisationVerification(undefined, requestForm());
    expect(response?.message).toContain("already have a verification request");
    expect(response?.message).not.toContain("private-service-error");
  });

  it("returns a generic unavailable address error without identifying the conflict", async () => {
    signedIn({ submitError: "23505" });
    const response = await submitOrganisationVerification(undefined, requestForm());
    expect(response?.message).toBe("This workspace address is unavailable. Choose another address and try again.");
    expect(navigation.revalidatePath).not.toHaveBeenCalled();
  });
});

describe("organisation verification withdrawal", () => {
  it("sends only the validated request ID and refreshes after void success", async () => {
    const { rpc } = signedIn();
    const form = withdrawalForm();
    form.set("status", "activated");
    form.set("applicant_id", "not-the-current-user");
    await expect(withdrawOrganisationVerification(undefined, form)).rejects.toThrow("redirect:/organisation/setup");
    expect(rpc).toHaveBeenCalledWith("withdraw_organisation_verification", { target_request: requestId });
    expect(navigation.revalidatePath).toHaveBeenCalledWith("/organisation/setup");
  });

  it("does not send a malformed request ID", async () => {
    const { rpc } = signedIn();
    expect((await withdrawOrganisationVerification(undefined, withdrawalForm("invalid-id")))?.message).toContain("could not be identified");
    expect(rpc).not.toHaveBeenCalledWith("withdraw_organisation_verification", expect.anything());
  });

  it.each([{ confirmed: false }, { projectRoles: ["engineer"] }])("rejects direct withdrawals that fail the role or work-email gate", async (fixture) => {
    const { rpc } = signedIn(fixture);
    expect((await withdrawOrganisationVerification(undefined, withdrawalForm()))?.message).toContain("cannot withdraw");
    expect(rpc).not.toHaveBeenCalledWith("withdraw_organisation_verification", expect.anything());
  });

  it("blocks audited preview and reports a safe error when withdrawal is refused", async () => {
    const { rpc } = signedIn({ organisations: workspaces, withdrawError: true });
    vi.mocked(readAdminPreview).mockResolvedValue({ role: "project_admin" } as never);
    expect((await withdrawOrganisationVerification(undefined, withdrawalForm()))?.message).toContain("cannot withdraw");
    expect(rpc).not.toHaveBeenCalledWith("withdraw_organisation_verification", expect.anything());

    vi.mocked(readAdminPreview).mockResolvedValue(null);
    expect((await withdrawOrganisationVerification(undefined, withdrawalForm()))?.message).toBe("We couldn’t withdraw this request. Refresh the page to check its current status.");
    expect(navigation.revalidatePath).not.toHaveBeenCalled();
  });
});
