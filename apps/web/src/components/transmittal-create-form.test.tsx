import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen} from "@testing-library/react";
import {TransmittalCreateForm} from "./transmittal-create-form";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import type {TransmittalHistoryItem} from "@/lib/transmittal-revisions";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh:vi.fn()})}));
vi.mock("@/app/app/actions", () => ({createDocumentTransmittal:vi.fn()}));
afterEach(cleanup);
const row = (id: string) => ({id, documentId:`doc-${id}`, documentNumber:`DOC-${id}`, title:`Deliverable ${id}`, discipline:"Process", documentType:"Report", revisionCode:"A01", issueStatus:"Issued for Approval"});
const issue = (id: string, packageState="ready"): TransmittalHistoryItem => ({...row(id), revisionId:id, packageId:`pack-${id}`, packageState, transmittalNumber:`TR-${id}`, createdAt:"2026-09-12T12:00:00Z"});
const props = {organisationId:"org", projectId:"project", defaultNumber:"TR-NEW", clientName:"Client", preparing:[], issuedRevisionNumbers:{}, revisions:[row("1"),row("2"),row("3")], history:[issue("1"),issue("2","failed")]};
it("only newly approved unissued revisions have checkboxes and bulk selection", () => {
  const {container} = render(<TransmittalCreateForm {...props} />);
  expect(screen.getAllByRole("checkbox")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", {name:"Select visible (max 100)"}));
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(el=>el.value)).toEqual(["3"]);
  expect(screen.getByRole("link",{name:"TR-1"}).getAttribute("href")).toContain("/work-packages/pack-1");
  expect(screen.getByRole("link",{name:"TR-2"}).getAttribute("href")).toContain("/work-packages/pack-2");
});
it("removes a selected revision from submission when refreshed props mark it issued", () => {
  const {container,rerender} = render(<TransmittalCreateForm {...props} />);
  fireEvent.click(screen.getByRole("checkbox"));
  rerender(<TransmittalCreateForm {...props} history={[...props.history,issue("3","frozen")]} />);
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(0);
  expect(screen.getByRole("button",{name:"Create transmittal"}).hasAttribute("disabled")).toBe(true);
});
it("search selects only matching ready revisions and preserves hidden intentional selections", () => {
  const {container} = render(<TransmittalCreateForm {...props} revisions={[row("3"),row("4")]} />);
  fireEvent.change(screen.getByLabelText("Find deliverable"),{target:{value:"DOC-4"}});
  fireEvent.click(screen.getByRole("button", {name:"Select visible (max 100)"}));
  fireEvent.change(screen.getByLabelText("Find deliverable"),{target:{value:"DOC-3"}});
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(el=>el.value)).toEqual(["4"]);
});
it("limits bulk selection to 100", () => {
  const {container} = render(<TransmittalCreateForm {...props} history={[]} revisions={Array.from({length:101},(_,i)=>row(String(i)))} />);
  fireEvent.click(screen.getByRole("button", {name:"Select visible (max 100)"}));
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(100);
});

it("allows preview search without unlocking selection or submission",()=>{
  const {container}=render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"document_controller",displayName:"DCC",disciplines:[],expiresAt:"2099-01-01"}}><TransmittalCreateForm {...props} revisions={[row("3"),row("4")]}/></AdminPreviewBoundary>);
  expect((screen.getByLabelText("Find deliverable") as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByLabelText("Discipline filter") as HTMLSelectElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Find deliverable"),{target:{value:"DOC-4"}});
  expect(screen.queryByLabelText("Select DOC-3 revision A01")).toBeNull();
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Create transmittal"}) as HTMLButtonElement).disabled).toBe(true);
  expect(fireEvent.submit(container.querySelector('form:not([method])')!)).toBe(false);
});
