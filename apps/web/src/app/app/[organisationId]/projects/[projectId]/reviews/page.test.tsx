import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import ReviewsPage from "./page";
import { requireProject } from "@/lib/auth";
import type { SubmissionReviewRow } from "@/components/submission-review-queue";

vi.mock("@/lib/auth", () => ({ requireProject: vi.fn() }));
vi.mock("next/navigation", () => ({ notFound: vi.fn(() => { throw new Error("notFound"); }) }));
vi.mock("@/components/help-tip", () => ({ HelpTip: () => null }));
vi.mock("@/app/app/workflow-actions", () => ({ reviewRevision: vi.fn() }));
vi.mock("@/components/revision-processing-status", () => ({
  RevisionProcessingStatus: ({ initialRevisionState, canRetry }: { initialRevisionState: string; canRetry: boolean }) => <div data-testid="processing-status" data-can-retry={canRetry}>{initialRevisionState} security checks</div>,
}));

const organisationId = "a0000000-0000-4000-8000-000000000001";
const projectId = "b0000000-0000-4000-8000-000000000001";
const base = `/app/${organisationId}/projects/${projectId}`;
let rows: SubmissionReviewRow[];
let error: unknown;
let role: string;
let preview: unknown;
const from = vi.fn();
const select = vi.fn();
const eq = vi.fn();
const neq = vi.fn();
const order = vi.fn();
const range = vi.fn();
const page = (query:Record<string,string>={}) => ReviewsPage({ params: Promise.resolve({ organisationId, projectId }),searchParams:Promise.resolve(query) });

function row(id: string, state = "ready", nativeFilename: string | null = null): SubmissionReviewRow {
  return {
    id, document_id: `document-${id}`, revision_code: "R01", issue_status: "Issued for Review (IFR)",
    original_filename: `${id}-approved-engineering-deliverable-for-project-review.pdf`,
    native_original_filename: nativeFilename, created_at: "2026-10-15T08:00:00Z", state,
    documents: { document_number: `MEC-${id}`, title: `Engineering document ${id}`, discipline: "Mechanical" },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  rows = [row("001", "processing"), row("002", "ready", "Detailed-native-source.dwg"), row("003", "ready")];
  error = null;
  role = "document_controller";
  preview = null;
  const builder = { select, eq, neq, order,range };
  from.mockReturnValue(builder);
  select.mockReturnValue(builder);
  eq.mockReturnValue(builder);
  neq.mockReturnValue(builder);
  order.mockReturnValue(builder);
  range.mockImplementation(async(start:number,end:number) => ({ data: rows.slice(start,end+1), error,count:rows.length }));
  vi.mocked(requireProject).mockImplementation(async () => ({ supabase: { from }, access: { role }, preview } as never));
});
afterEach(cleanup);

it("keeps tenant-scoped DCC authorization and oldest-first submitted queue filters", async () => {
  render(await page());
  expect(requireProject).toHaveBeenCalledWith(organisationId, projectId);
  expect(eq).toHaveBeenCalledWith("organisation_id", organisationId);
  expect(eq).toHaveBeenCalledWith("project_id", projectId);
  expect(eq).toHaveBeenCalledWith("control_status", "submitted");
  expect(neq).toHaveBeenCalledWith("state", "pending_upload");
  expect(order).toHaveBeenCalledWith("created_at");
  expect(screen.getByRole("heading",{level:1,name:"Submission review"}).className).toContain("text-2xl");
  expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
  expect(screen.getByRole("link", { name: "Document control centre" }).getAttribute("href")).toBe(`${base}/control`);
});

it("uses compact native disclosures with only the first ready submission expanded", async () => {
  render(await page());
  const disclosures = Array.from(document.querySelectorAll("details"));
  expect(disclosures.map((details) => details.open)).toEqual([false, true, false]);
  expect(disclosures.map((details) => details.querySelector("h2")?.textContent)).toEqual(rows.map((entry) => entry.documents!.title));
  expect(screen.getByText("3 submissions awaiting review")).toBeTruthy();
  for (const details of disclosures) {
    expect(details.querySelector("summary")?.textContent).toContain("Issued for Review (IFR)");
    expect(details.querySelector("summary")?.textContent).toContain("Submitted 15/10/2026");
  }
});

it("opens the first row if no ready submission exists and preserves failed processing controls", async () => {
  rows = [row("001", "failed"), row("002", "quarantined")];
  render(await page());
  const disclosures = Array.from(document.querySelectorAll("details"));
  expect(disclosures.map((details) => details.open)).toEqual([true, false]);
  expect(disclosures[0].querySelector("summary")?.textContent).toContain("Failed");
  expect(screen.getAllByTestId("processing-status")).toHaveLength(2);
  expect(screen.getAllByTestId("processing-status").every((status) => status.getAttribute("data-can-retry") === "true")).toBe(true);
});

it.each(["superseded", "cancelled", "pending_validation"])("labels %s honestly instead of implying active processing", async (state) => {
  rows = [row("001", state)];
  render(await page());
  const summary = document.querySelector("summary");
  expect(summary?.textContent).toContain(state.replaceAll("_", " "));
  expect(summary?.textContent).not.toContain("Processing");
  expect((document.querySelector('button[value="accepted"]') as HTMLButtonElement).disabled).toBe(true);
});

it("keeps all filenames readable and only offers secure files and approval for ready submissions", async () => {
  render(await page());
  const [processing, ready] = Array.from(document.querySelectorAll("details"));
  expect(processing.querySelector('a[href$="/preview"]')).toBeNull();
  expect(processing.querySelector('a[href$="/download"]')).toBeNull();
  expect((processing.querySelector('button[value="accepted"]') as HTMLButtonElement).disabled).toBe(true);
  expect(ready.querySelector('a[href$="/preview"]')?.getAttribute("href")).toBe(`${base}/documents/document-002/revisions/002/preview`);
  expect(ready.querySelector('a[href$="/native-download"]')).toBeTruthy();
  expect((ready.querySelector('button[value="accepted"]') as HTMLButtonElement).disabled).toBe(false);
  expect(ready.querySelector("dd")?.textContent).toBe(rows[1].original_filename);
  expect(ready.querySelector("dd")?.className).not.toContain("truncate");
  expect(ready.querySelector('[data-testid="processing-status"]')).toBeNull();
  expect(screen.getAllByTestId("processing-status")).toHaveLength(1);
});

it.each(["quarantined", "processing", "failed"])("blocks secure files and every conformance action while %s", async (state) => {
  rows = [row("001", state, "native-source.dwg")];
  render(await page());
  expect(document.querySelector('a[href$="/preview"],a[href$="/download"],a[href$="/native-download"]')).toBeNull();
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Approve submission" }) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button", { name: "Return" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByTestId("processing-status")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Open document record for MEC-001" })).toBeTruthy();
});

it("retains required visible conformance confirmation and labelled return comments", async () => {
  render(await page());
  const ready = document.querySelectorAll("details")[1];
  expect(within(ready).getByRole("group", { name: "Conformance confirmation" })).toBeTruthy();
  const confirmation = within(ready).getByRole("checkbox") as HTMLInputElement;
  expect(confirmation.required).toBe(true);
  expect(confirmation.disabled).toBe(false);
  expect(confirmation.labels?.[0].textContent).toMatch(/secure preview[\s\S]*editable native source[\s\S]*conform to the MDR/);
  const comment = within(ready).getByRole("textbox", { name: "Review comment or return instructions" }) as HTMLInputElement;
  expect(comment.maxLength).toBe(1000);
  expect((within(ready).getByRole("button", { name: "Return" }) as HTMLButtonElement).formNoValidate).toBe(true);
  for (const button of ready.querySelectorAll("button")) expect(button.className).toContain("min-h-11");
});

it("shows audited preview read-only and disables every review mutation and processing retry", async () => {
  preview = { targetUserId: "dcc-member" };
  render(await page());
  expect(screen.getByText("Audited DCC preview · Read-only")).toBeTruthy();
  expect(Array.from(document.querySelectorAll('button[name="decision"],input[name="comment"],input[type="checkbox"]')).every((input) => (input as HTMLInputElement).disabled)).toBe(true);
  expect(screen.getByTestId("processing-status").getAttribute("data-can-retry")).toBe("false");
  expect(screen.getByRole("link", { name: /Open secure preview for MEC-002/ })).toBeTruthy();
});

it("does not claim an empty queue or expose provider errors when loading fails", async () => {
  error = { message: "supabase private-test-table secret=private-detail" };
  rows = [];
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("link", { name: "Retry submissions" }).getAttribute("href")).toBe(`${base}/reviews`);
  expect(screen.queryByText(/0 submissions|No engineer submissions/)).toBeNull();
  expect(document.body.textContent).not.toMatch(/supabase|private-test-table|private-detail/);
});

it("shows a genuine empty queue only after a successful read", async () => {
  rows = [];
  render(await page());
  expect(screen.getByText("0 submissions awaiting review")).toBeTruthy();
  expect(screen.getByText("No engineer submissions are waiting for review.")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each(["engineer", "project_admin", "organisation_admin", "viewer"])("blocks %s before reading the DCC review queue", async (nextRole) => {
  role = nextRole;
  await expect(page()).rejects.toThrow("notFound");
  expect(from).not.toHaveBeenCalled();
});
it("searches the entire authorised queue and links to later result pages without changing review actions",async()=>{
  rows=Array.from({length:56},(_,index)=>row(String(index).padStart(3,"0")));
  render(await page({page:"2"}));
  expect(document.querySelectorAll("details")).toHaveLength(25);
  expect(screen.getByRole("status").textContent).toContain("Showing 26–50 of 56");
  expect(screen.getByRole("link",{name:"Next submissions page"}).getAttribute("href")).toBe(`${base}/reviews?page=3`);
  expect(screen.getByRole("form",{name:"Search submission review"}).getAttribute("method")).toBe("get");
  expect(range).toHaveBeenCalledWith(0,499);
  cleanup();render(await page({q:"MEC-055"}));
  expect(document.querySelectorAll("details")).toHaveLength(1);expect(screen.getByText("Engineering document 055")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toContain("1 matching submissions");
});
it("keeps status and search browsing usable in read-only preview and reports an empty match honestly",async()=>{
  preview={targetUserId:"dcc-member"};render(await page({q:"not found",state:"ready"}));
  expect(screen.getByText(/No submissions match/)).toBeTruthy();
  expect(screen.getByRole("form",{name:"Search submission review"}).hasAttribute("data-preview-safe")).toBe(true);
  expect(screen.getByRole("combobox",{name:"Security status"})).toHaveProperty("value","ready");
  expect(screen.queryByRole("button",{name:"Approve submission"})).toBeNull();
});
