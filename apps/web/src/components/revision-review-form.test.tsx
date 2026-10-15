import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { RevisionReviewForm } from "./revision-review-form";

const formState = vi.hoisted(() => ({ pending: false, state: undefined as { ok: boolean; message: string } | undefined }));
vi.mock("react", async (load) => ({
  ...await load<typeof import("react")>(),
  useActionState: () => [formState.state, () => {}, formState.pending],
}));
vi.mock("@/app/app/workflow-actions", () => ({ reviewRevision: vi.fn() }));

beforeEach(() => { formState.pending = false; formState.state = undefined; });
afterEach(cleanup);
const form = (ready = true, readOnly = false) => <RevisionReviewForm organisationId="organisation" projectId="project" revisionId="revision" ready={ready} readOnly={readOnly} />;

it.each([
  [false, false, false, false],
  [true, true, false, false],
  [true, false, true, false],
  [true, false, false, true],
])("keeps controls disabled for not-ready, read-only, pending or successful state (%s,%s,%s,%s)", (ready, readOnly, pending, succeeded) => {
  formState.pending = pending;
  formState.state = succeeded ? { ok: true, message: "Submission approved." } : undefined;
  render(form(ready, readOnly));
  for (const control of document.querySelectorAll('button,input:not([type="hidden"])')) expect((control as HTMLInputElement).disabled).toBe(true);
});

it("keeps review state feedback accessible without disabling a failed retry", () => {
  formState.state = { ok: false, message: "The review could not be saved. Try again." };
  render(form());
  expect(screen.getByRole("alert").textContent).toContain("could not be saved");
  expect((screen.getByRole("button", { name: "Approve submission" }) as HTMLButtonElement).disabled).toBe(false);
});

it("keeps Return before Approve so implicit form submission does not default to acceptance", () => {
  render(form());
  const decisions = screen.getAllByRole("button") as HTMLButtonElement[];
  expect(decisions.map((button) => button.value)).toEqual(["returned", "accepted"]);
  expect(decisions[0].formNoValidate).toBe(true);
  expect(decisions[1].formNoValidate).toBe(false);
  expect((screen.getByRole("checkbox") as HTMLInputElement).required).toBe(true);
});
