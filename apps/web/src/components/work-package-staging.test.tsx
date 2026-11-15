import {act, cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {WorkPackageStagingData} from "@/lib/work-package-staging";
import {WorkPackageStaging} from "./work-package-staging";

const {save} = vi.hoisted(() => ({save: vi.fn()}));
vi.mock("@/app/app/work-package-staging-action", () => ({saveWorkPackageStaging: save}));
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));

const issuedForReview = "Issued for Review (IFR)";
const issuedForDesign = "Issued for Design (IFD)";
const staging: WorkPackageStagingData = {
  updated_at: "2026-11-15T09:00:00+00:00",
  preferred_status: "IFD",
  documents: [
    {
      id: "el-1", document_number: "EL-001", discipline: "Electrical", document_type: "Drawing",
      inclusion_state: "status_mismatch", revision_id: "el-1-r02", revisions: [
        {id: "el-1-r02", revision_code: "R02", issue_status: issuedForReview},
        {id: "el-1-d02", revision_code: "D02", issue_status: "IFD"},
        {id: "el-1-d01", revision_code: "D01", issue_status: issuedForDesign},
      ],
    },
    {
      id: "el-2", document_number: "EL-002", discipline: "Electrical", document_type: "Drawing",
      inclusion_state: "included", revision_id: "el-2-r01", revisions: [
        {id: "el-2-r01", revision_code: "R01", issue_status: issuedForReview},
      ],
    },
    {
      id: "el-3", document_number: "EL-003", discipline: "Electrical", document_type: "Specification",
      inclusion_state: "missing_revision", revision_id: null, revisions: [],
    },
    {
      id: "pr-1", document_number: "PR-001", discipline: "Process", document_type: "Drawing",
      inclusion_state: "included", revision_id: "pr-1-r01", revisions: [
        {id: "pr-1-d01", revision_code: "D01", issue_status: issuedForDesign},
        {id: "pr-1-r01", revision_code: "R01", issue_status: issuedForReview},
      ],
    },
  ],
};
const props = {organisationId: "org", projectId: "project", packageId: "package", staging};
const include = (documentNumber: string) => screen.getByRole<HTMLInputElement>("checkbox", {name: `Include ${documentNumber} in package`});
const revision = (documentNumber: string) => screen.getByRole<HTMLSelectElement>("combobox", {name: `Revision for ${documentNumber}`});
const form = () => screen.getByRole<HTMLFormElement>("form", {name: "Stage package documents"});
const selection = () => JSON.parse(String(new FormData(form()).get("selection")));

beforeEach(() => { save.mockReset(); });
afterEach(cleanup);

it("opens the first discipline needing attention and shows genuinely unavailable documents as excluded", () => {
  const {container} = render(<WorkPackageStaging {...props} />);
  expect(screen.getByRole("region", {name: "Stage package documents"})).toBeTruthy();
  expect(Array.from(container.querySelectorAll("details")).map(folder => folder.open)).toEqual([true, false]);
  expect(include("EL-001").checked).toBe(false);
  expect(revision("EL-001").value).toBe("el-1-r02");
  expect(include("EL-002").checked).toBe(true);
  expect(include("EL-003").disabled).toBe(true);
  expect(screen.getByText("No eligible revision. Excluded from ZIP.")).toBeTruthy();
  expect(screen.queryByRole("combobox", {name: "Revision for EL-003"})).toBeNull();
});

it("applies a discipline's preferred purpose with the latest matching revision, preserving unmatched and other discipline choices", () => {
  render(<WorkPackageStaging {...props} />);
  expect(within(screen.getByRole("combobox", {name: "Preferred issue purpose for Electrical"})).getByRole("option", {name: issuedForDesign})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Apply preference to Electrical"}));
  expect(screen.getByText(/1 document selected. Choices for documents without a match were left unchanged/)).toBeTruthy();
  expect(include("EL-001").checked).toBe(true);
  expect(revision("EL-001").value).toBe("el-1-d02");
  expect(selection()).toEqual([
    {item_id: "el-1", revision_id: "el-1-d02"},
    {item_id: "el-2", revision_id: "el-2-r01"},
    {item_id: "el-3", revision_id: null},
    {item_id: "pr-1", revision_id: "pr-1-r01"},
  ]);
});

it("selects an earlier accepted revision, includes an exception and saves unchanged and excluded rows explicitly", async () => {
  save.mockResolvedValue({message: "The selection could not be saved."});
  render(<WorkPackageStaging {...props} />);
  fireEvent.change(revision("EL-001"), {target: {value: "el-1-d01"}});
  expect(include("EL-001").checked).toBe(false);
  fireEvent.click(include("EL-001"));
  fireEvent.click(include("EL-002"));
  await act(async () => {fireEvent.submit(form());});
  expect(screen.getByRole("alert").textContent).toBe("The selection could not be saved.");
  expect(revision("EL-001").value).toBe("el-1-d01");
  expect(include("EL-001").checked).toBe(true);
  expect(include("EL-002").checked).toBe(false);
  const submitted = save.mock.calls[0][1] as FormData;
  expect(Object.fromEntries(submitted)).toMatchObject({
    organisationId: "org", projectId: "project", packageId: "package", updatedAt: staging.updated_at,
  });
  expect(JSON.parse(String(submitted.get("selection")))).toEqual([
    {item_id: "el-1", revision_id: "el-1-d01"},
    {item_id: "el-2", revision_id: null},
    {item_id: "el-3", revision_id: null},
    {item_id: "pr-1", revision_id: "pr-1-r01"},
  ]);
});

it("prevents an empty archive and keeps missing documents out", async () => {
  render(<WorkPackageStaging {...props} staging={{...staging, documents: [staging.documents[0], staging.documents[2]]}} />);
  expect(screen.getByRole<HTMLButtonElement>("button", {name: "Save package selection"}).disabled).toBe(true);
  expect(screen.getByText("Select at least one accepted revision to save this package.")).toBeTruthy();
  await act(async () => {fireEvent.submit(form());});
  expect(save).not.toHaveBeenCalled();
  fireEvent.click(include("EL-001"));
  expect(screen.getByRole<HTMLButtonElement>("button", {name: "Save package selection"}).disabled).toBe(false);
});

it("only allows ZIP generation from a saved selection and restores the control after changes are reverted", () => {
  render(<WorkPackageStaging {...props} staging={{...staging, documents: [staging.documents[1], staging.documents[3]]}}
    generateEndpoint="/generate" />);
  expect(screen.getByRole("button", {name: "Generate package ZIP"})).toBeTruthy();
  fireEvent.click(include("EL-002"));
  expect(screen.queryByRole("button", {name: "Generate package ZIP"})).toBeNull();
  expect(screen.getByText("Save your changes before generating the ZIP.")).toBeTruthy();
  fireEvent.click(include("EL-002"));
  expect(screen.getByRole("button", {name: "Generate package ZIP"})).toBeTruthy();
});

it("reports empty staging as distinct from an unselected document list", () => {
  render(<WorkPackageStaging {...props} staging={{...staging, documents: []}} />);
  expect(screen.getByText("No documents are staged for this package.")).toBeTruthy();
  expect(screen.queryByRole("button", {name: "Save package selection"})).toBeNull();
});
