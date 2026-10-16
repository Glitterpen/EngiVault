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

it("preserves the review payload and explicit comment label after shared form adoption",()=>{
  render(form());
  const comment=screen.getByLabelText("Review comment or return instructions") as HTMLInputElement;
  expect(comment.id).toBeTruthy();
  expect(comment.name).toBe("comment");
  expect(comment.maxLength).toBe(1000);
  const data=new FormData(comment.form!);
  expect(data.get("organisationId")).toBe("organisation");
  expect(data.get("projectId")).toBe("project");
  expect(data.get("revisionId")).toBe("revision");
  expect(data.get("comment")).toBe("");
  expect((screen.getByRole("checkbox") as HTMLInputElement).value).toBe("yes");
});

it("retains a successful review as a status while keeping both decision controls locked",()=>{
  formState.state={ok:true,message:"Submission approved."};
  render(form());
  expect(screen.getByRole("status").textContent).toBe("Submission approved.");
  for(const button of screen.getAllByRole("button"))expect((button as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});
