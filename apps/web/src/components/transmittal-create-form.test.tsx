import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {TransmittalCreateForm} from "./transmittal-create-form";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import type {TransmittalHistoryItem} from "@/lib/transmittal-revisions";
import {TRANSMITTAL_DAILY_NOTICE} from "@/lib/submission-override";
import {createDocumentTransmittal} from "@/app/app/actions";
const {router} = vi.hoisted(() => ({router: {refresh:vi.fn()}}));
vi.mock("next/navigation", () => ({useRouter: () => router}));
vi.mock("@/app/app/actions", () => ({createDocumentTransmittal:vi.fn()}));
afterEach(() => {cleanup();vi.clearAllMocks();vi.restoreAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const row = (id: string) => ({id, documentId:`doc-${id}`, documentNumber:`DOC-${id}`, title:`Deliverable ${id}`, discipline:"Process", documentType:"Report", revisionCode:"A01", issueStatus:"Issued for Approval"});
const issue = (id: string, packageState="ready"): TransmittalHistoryItem => ({...row(id), revisionId:id, packageId:`pack-${id}`, packageState, transmittalNumber:`TR-${id}`, createdAt:"2026-09-12T12:00:00Z"});
const props = {organisationId:"org", projectId:"project", defaultNumber:"TR-NEW", clientName:"Client", preparing:[], issuedRevisionNumbers:{}, revisions:[row("1"),row("2"),row("3")], history:[issue("1"),issue("2","failed")]};
it("explains electronic issue and recipient acknowledgement without claiming a qualified signature or seal",()=>{
  const {container}=render(<TransmittalCreateForm {...props}/>);
  fireEvent.focus(screen.getByRole("button",{name:"Transmittal acknowledgement"}));
  const guidance=screen.getByRole("tooltip").textContent;
  expect(guidance).toContain("System-issued transmittal. Issuer and issue date recorded electronically.");
  expect(guidance).toContain("recipient signs and dates");
  expect(guidance).not.toMatch(/qualified|seal|attestation/i);
  expect(container.querySelectorAll('input[name="revisionIds"]:checked')).toHaveLength(0);
  expect(createDocumentTransmittal).not.toHaveBeenCalled();
});
it("offers an accessible neutral-default PDF template without changing revision selections",()=>{
  const {container}=render(<TransmittalCreateForm {...props}/>);
  const select=screen.getByRole("combobox",{name:"PDF colour template"}) as HTMLSelectElement;
  expect(select.value).toBe("neutral");fireEvent.click(screen.getByRole("checkbox"));
  fireEvent.change(select,{target:{value:"burgundy"}});
  const form=container.querySelector("form")!;expect(new FormData(form).get("pdfColorTemplate")).toBe("burgundy");expect(new FormData(form).getAll("revisionIds")).toEqual(["3"]);
});
it("disables colour-template changes in a read-only transmittal preview",()=>{
  render(<TransmittalCreateForm {...props} readOnly/>);
  expect((screen.getByRole("combobox",{name:"PDF colour template"}) as HTMLSelectElement).disabled).toBe(true);
});
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
it("adds matching search results without replacing hidden intentional selections", () => {
  const {container} = render(<TransmittalCreateForm {...props} revisions={[row("3"),row("4")]} />);
  fireEvent.change(screen.getByLabelText("Find deliverable"),{target:{value:"DOC-4"}});
  fireEvent.click(screen.getByRole("button", {name:"Select visible (max 100)"}));
  fireEvent.change(screen.getByLabelText("Find deliverable"),{target:{value:"DOC-3"}});
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(el=>el.value)).toEqual(["4"]);
  fireEvent.click(screen.getByRole("button", {name:"Select visible (max 100)"}));
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(el=>el.value)).toEqual(["4","3"]);
});
it("limits bulk selection to 100", () => {
  const {container} = render(<TransmittalCreateForm {...props} history={[]} revisions={Array.from({length:101},(_,i)=>row(String(i)))} />);
  fireEvent.click(screen.getByRole("button", {name:"Select visible (max 100)"}));
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(100);
});

it("adds another discipline's visible deliverables and retains the first discipline's selections", () => {
  const {container}=render(<TransmittalCreateForm {...props} history={[]} revisions={[row("A"),{...row("B"),discipline:"Electrical"}]} />);
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Process"}});
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Electrical"}});
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(input=>input.value)).toEqual(["A","B"]);
  expect(screen.getByText("Includes selections outside the current filters.")).toBeTruthy();
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:""}});
  expect((screen.getByRole("checkbox",{name:"Select DOC-A revision A01"}) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole("checkbox",{name:"Select DOC-B revision A01"}) as HTMLInputElement).checked).toBe(true);
});

it("deduplicates bulk additions without clearing already-selected visible revisions", () => {
  const {container}=render(<TransmittalCreateForm {...props} history={[]} revisions={[row("A"),row("B")]} />);
  fireEvent.click(screen.getByRole("checkbox",{name:"Select DOC-A revision A01"}));
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  const selectVisible=screen.getByRole("button",{name:"Select visible (max 100)"}) as HTMLButtonElement;
  expect(selectVisible.disabled).toBe(true);
  fireEvent.click(selectVisible);
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(input=>input.value)).toEqual(["A","B"]);
});

it("unselects one visible revision without dropping a hidden selected revision", () => {
  const {container}=render(<TransmittalCreateForm {...props} history={[]} revisions={[row("A"),{...row("B"),discipline:"Electrical"}]} />);
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Electrical"}});
  fireEvent.click(screen.getByRole("checkbox",{name:"Select DOC-B revision A01"}));
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(input=>input.value)).toEqual(["A"]);
  expect((screen.getByRole("checkbox",{name:"Select DOC-B revision A01"}) as HTMLInputElement).checked).toBe(false);
});

it("distinguishes clearing visible revisions from clearing all selections, including hidden selections", () => {
  const {container}=render(<TransmittalCreateForm {...props} history={[]} revisions={[row("A"),{...row("B"),discipline:"Electrical"}]} />);
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Electrical"}});
  fireEvent.click(screen.getByRole("button",{name:"Clear visible"}));
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(input=>input.value)).toEqual(["A"]);
  fireEvent.change(screen.getByRole("searchbox",{name:"Find deliverable"}),{target:{value:"No matching document"}});
  expect((screen.getByRole("button",{name:"Clear visible"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Clear all selections"}) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"Clear all selections"}));
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(0);
  expect((screen.getByRole("button",{name:"Clear all selections"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Create transmittal"}) as HTMLButtonElement).disabled).toBe(true);
});

it("counts hidden selections toward the 100-revision limit and never replaces them to make room", () => {
  const process=Array.from({length:99},(_,index)=>row(`P${index}`));
  const electrical=[{...row("E1"),discipline:"Electrical"},{...row("E2"),discipline:"Electrical"}];
  const {container}=render(<TransmittalCreateForm {...props} history={[]} revisions={[...process,...electrical]} />);
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Process"}});
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Electrical"}});
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  const ids=[...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(input=>input.value);
  expect(ids).toEqual([...process.map(revision=>revision.id),"E1"]);
  expect(ids).toHaveLength(100);
  expect((screen.getByRole("checkbox",{name:"Select DOC-E1 revision A01"}) as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole("checkbox",{name:"Select DOC-E2 revision A01"}) as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Select visible (max 100)"}) as HTMLButtonElement).disabled).toBe(true);
});

it("revalidates hidden selections against refreshed issued and reserved data before bulk additions", () => {
  const revisions=[row("A"),row("B"),{...row("C"),discipline:"Electrical"}];
  const {container,rerender}=render(<TransmittalCreateForm {...props} history={[]} revisions={revisions} />);
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Process"}});
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  fireEvent.change(screen.getByRole("combobox",{name:"Discipline filter"}),{target:{value:"Electrical"}});
  rerender(<TransmittalCreateForm {...props} revisions={revisions} history={[issue("A","failed")]} issuedRevisionNumbers={{B:["TR-B"]}} />);
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(0);
  fireEvent.click(screen.getByRole("button",{name:"Select visible (max 100)"}));
  expect([...container.querySelectorAll<HTMLInputElement>('input[name="revisionIds"]')].map(input=>input.value)).toEqual(["C"]);
});

it("allows preview search without unlocking selection or submission",()=>{
  const {container}=render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"document_controller",displayName:"DCC",disciplines:[],expiresAt:"2099-01-01"}}><TransmittalCreateForm {...props} revisions={[row("3"),row("4")]} readOnly/></AdminPreviewBoundary>);
  expect((screen.getByLabelText("Find deliverable") as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByLabelText("Discipline filter") as HTMLSelectElement).disabled).toBe(false);
  fireEvent.change(screen.getByLabelText("Find deliverable"),{target:{value:"DOC-4"}});
  expect(screen.queryByLabelText("Select DOC-3 revision A01")).toBeNull();
  expect((screen.getByRole("checkbox") as HTMLInputElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Create transmittal"}) as HTMLButtonElement).disabled).toBe(true);
  expect(fireEvent.submit(container.querySelector('form:not([method])')!)).toBe(false);
  const refresh=screen.getByRole("button",{name:"Refresh accepted list"}) as HTMLButtonElement;
  expect(refresh.disabled).toBe(false);
  fireEvent.click(refresh);
  expect(router.refresh).toHaveBeenCalledOnce();
  expect(createDocumentTransmittal).not.toHaveBeenCalled();
});

it("names the main sections and keeps the ready selection controls accessible", () => {
  render(<TransmittalCreateForm {...props} />);
  expect(screen.getByRole("region", {name:"Transmission queue"})).toBeTruthy();
  expect(screen.getByRole("region", {name:"Transmission details"})).toBeTruthy();
  const ready=screen.getByRole("region", {name:"Ready for transmission"});
  expect(within(ready).getByRole("searchbox", {name:"Find deliverable"})).toBeTruthy();
  expect(within(ready).getByRole("combobox", {name:"Discipline filter"})).toBeTruthy();
  expect(within(ready).getByRole("group", {name:"Ready deliverables"})).toBeTruthy();
  expect(screen.getByRole("button",{name:"Create transmittal"}).className).toContain("min-h-11");
  expect(screen.getByRole("button",{name:"Refresh accepted list"}).className).toContain("min-h-11");
});

it("keeps optional recipient fields mounted in a collapsed native disclosure without changing the field contract", () => {
  const {container}=render(<TransmittalCreateForm {...props} />);
  const contact=container.querySelector<HTMLInputElement>('input[name="recipientContact"]')!;
  const email=container.querySelector<HTMLInputElement>('input[name="recipientEmail"]')!;
  const message=container.querySelector<HTMLTextAreaElement>('textarea[name="message"]')!;
  const optionalDetails=contact.closest("details")!;
  expect(optionalDetails.open).toBe(false);
  expect(email.closest("details")).toBe(optionalDetails);
  expect(message.closest("details")).toBe(optionalDetails);
  expect(contact.required).toBe(false);
  expect(email.type).toBe("email");
  expect(email.required).toBe(false);
  expect(message.maxLength).toBe(2000);
  expect(container.querySelector<HTMLInputElement>('input[name="transmittalNumber"]')?.required).toBe(true);
  expect(container.querySelector<HTMLInputElement>('input[name="transmittalNumber"]')?.value).toBe("TR-NEW");
  fireEvent.change(contact,{target:{value:"Client representative"}});
  fireEvent.click(optionalDetails.querySelector("summary")!);
  expect(container.querySelector('input[name="recipientContact"]')).toBe(contact);
  expect(contact.value).toBe("Client representative");
  expect(container.querySelector<HTMLInputElement>('input[name="organisationId"]')?.value).toBe("org");
  expect(container.querySelector<HTMLInputElement>('input[name="projectId"]')?.value).toBe("project");
});

it("opens optional recipient details when a hidden field fails browser validation", () => {
  const {container}=render(<TransmittalCreateForm {...props} />);
  const email=container.querySelector<HTMLInputElement>('input[name="recipientEmail"]')!;
  const optionalDetails=email.closest("details")!;
  expect(optionalDetails.open).toBe(false);
  fireEvent.invalid(email);
  expect(optionalDetails.open).toBe(true);
});

it("keeps the daily notice and missing-client blocker outside optional disclosures", () => {
  render(<TransmittalCreateForm {...props} clientName={null} />);
  fireEvent.click(screen.getByRole("checkbox"));
  expect(screen.getByText(TRANSMITTAL_DAILY_NOTICE).closest("details")).toBeNull();
  const blocker=screen.getByRole("alert");
  expect(blocker.textContent).toContain("Project Manager adds the client name");
  expect(blocker.closest("details")).toBeNull();
  expect(screen.getByRole("button",{name:"Create transmittal"}).hasAttribute("disabled")).toBe(true);
});

it("explains when an intentional selection is outside the current filters", () => {
  render(<TransmittalCreateForm {...props} revisions={[row("3"),row("4")]} />);
  fireEvent.click(screen.getByRole("checkbox",{name:"Select DOC-4 revision A01"}));
  fireEvent.change(screen.getByRole("searchbox",{name:"Find deliverable"}),{target:{value:"DOC-3"}});
  expect(screen.getByText("Includes selections outside the current filters.")).toBeTruthy();
  expect(screen.getByText(/1 document selected/).getAttribute("aria-live")).toBe("polite");
});

it("separates transmitted and reserved history from selectable revisions and keeps failures visible", () => {
  render(<TransmittalCreateForm {...props} preparing={[{...row("5"),state:"failed",createdAt:"2026-10-16T10:00:00Z"}]} />);
  const failed=screen.getByText("Needs retry");
  expect(failed.closest("details")?.open).toBe(true);
  expect(screen.getByText("1 approved · Preparation needs attention")).toBeTruthy();
  expect(screen.queryByRole("checkbox",{name:"Select DOC-5 revision A01"})).toBeNull();
  expect(screen.getByText("Staged / needs attention",{selector:"summary"}).closest("details")?.open).toBe(false);
  expect(screen.getByText("Already transmitted",{selector:"summary"}).closest("details")?.open).toBe(false);
});

it("refreshes accepted data only when the refresh control is used", () => {
  render(<TransmittalCreateForm {...props} />);
  fireEvent.click(screen.getByRole("button",{name:"Refresh accepted list"}));
  expect(router.refresh).toHaveBeenCalledTimes(1);
});

it("retains automatic secure preparation endpoint and visible progress outside the collapsed list", async () => {
  const fetcher=vi.fn().mockResolvedValue({ok:true});
  vi.stubGlobal("fetch",fetcher);
  render(<TransmittalCreateForm {...props} preparing={[{...row("5"),state:"processing",createdAt:"2026-10-16T10:00:00Z"}]} />);
  await waitFor(()=>expect(fetcher).toHaveBeenCalledWith(
    "/api/v1/organisations/org/projects/project/work-packages/transmittals/process",
    {method:"POST",cache:"no-store",signal:expect.any(AbortSignal)},
  ));
  await waitFor(()=>expect(router.refresh).toHaveBeenCalledTimes(1));
  expect(screen.getByText("Preparing recently accepted files for transmission...").closest("details")).toBeNull();
  expect(screen.getByText("1 approved · Preparing for transmission").closest("details")?.open).toBe(false);
});

it("does not start processing, timers or selection/submission in a read-only preview without relying on the boundary",async()=>{
  vi.useFakeTimers();
  const timeouts=vi.spyOn(globalThis,"setTimeout");
  const fetcher=vi.fn();
  vi.stubGlobal("fetch",fetcher);
  const {container}=render(<TransmittalCreateForm {...props} readOnly preparing={[{...row("5"),state:"processing",createdAt:"2026-10-16T10:00:00Z"}]} />);
  expect(timeouts.mock.calls.filter(([,delay])=>delay===4000||delay===10000)).toHaveLength(0);
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
  expect(fetcher).not.toHaveBeenCalled();
  expect(router.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText(/Automatic preparation paused/)).toBeNull();
  expect(screen.queryByText("Preparing recently accepted files for transmission...")).toBeNull();
  expect(screen.getByText(/Read-only preview\. Automatic preparation/)).toBeTruthy();
  for(const label of ["Transmittal number","Attention","Recipient email","Cover message (optional)"]){
    expect((screen.getByLabelText(label) as HTMLInputElement|HTMLTextAreaElement).disabled).toBe(true);
  }
  for(const name of ["Select visible (max 100)","Clear visible","Clear all selections","Create transmittal"]){
    expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name}));
  }
  const checkbox=screen.getByRole("checkbox") as HTMLInputElement;
  expect(checkbox.disabled).toBe(true);
  fireEvent.click(checkbox);
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(0);
  expect(fireEvent.submit(screen.getByRole("form",{name:"Create document transmittal"}))).toBe(false);
  expect(createDocumentTransmittal).not.toHaveBeenCalled();
  expect(timeouts.mock.calls.filter(([,delay])=>delay===4000||delay===10000)).toHaveLength(0);
});

it.each([true,false])("cancels the scheduled processing %s-result retry and hides processing feedback when switched to read-only",async(ok)=>{
  vi.useFakeTimers();
  const timeouts=vi.spyOn(globalThis,"setTimeout");
  const clearTimer=vi.spyOn(globalThis,"clearTimeout");
  const fetcher=vi.fn().mockResolvedValue({ok});
  vi.stubGlobal("fetch",fetcher);
  const preparing=[{...row("5"),state:"processing",createdAt:"2026-10-16T10:00:00Z"}];
  const {container,rerender}=render(<TransmittalCreateForm {...props} preparing={preparing}/>);
  await act(async()=>{await Promise.resolve();});
  expect(fetcher).toHaveBeenCalledOnce();
  const scheduled=timeouts.mock.calls.findIndex(([,delay])=>delay===(ok?4000:10000));
  expect(scheduled).toBeGreaterThanOrEqual(0);
  const retryTimer=timeouts.mock.results[scheduled].value;
  fireEvent.click(screen.getByRole("checkbox"));
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(1);
  const signal=fetcher.mock.calls[0][1].signal as AbortSignal;
  rerender(<TransmittalCreateForm {...props} preparing={preparing} readOnly/>);
  expect(signal.aborted).toBe(true);
  expect(clearTimer).toHaveBeenCalledWith(retryTimer);
  expect(container.querySelectorAll('input[name="revisionIds"]')).toHaveLength(0);
  expect(screen.queryByText(/Automatic preparation paused|Preparing recently accepted files for transmission/)).toBeNull();
  const refreshes=router.refresh.mock.calls.length;
  await act(async()=>{await vi.advanceTimersByTimeAsync(30000);});
  expect(fetcher).toHaveBeenCalledOnce();
  expect(router.refresh).toHaveBeenCalledTimes(refreshes);
});

it("does not refresh, retry or publish a late processing failure after switching to read-only",async()=>{
  vi.useFakeTimers();
  const timeouts=vi.spyOn(globalThis,"setTimeout");
  let rejectProcessing:(error:Error)=>void=()=>{};
  const fetcher=vi.fn(()=>new Promise<Response>((_resolve,reject)=>{rejectProcessing=reject;}));
  vi.stubGlobal("fetch",fetcher);
  const preparing=[{...row("5"),state:"quarantined",createdAt:"2026-10-16T10:00:00Z"}];
  const {rerender}=render(<TransmittalCreateForm {...props} preparing={preparing}/>);
  rerender(<TransmittalCreateForm {...props} preparing={preparing} readOnly/>);
  await act(async()=>{rejectProcessing(new Error("late processing failure"));await Promise.resolve();});
  expect(fetcher).toHaveBeenCalledOnce();
  expect(timeouts.mock.calls.filter(([,delay])=>delay===4000||delay===10000)).toHaveLength(0);
  expect(router.refresh).not.toHaveBeenCalled();
  expect(screen.queryByText(/Automatic preparation paused/)).toBeNull();
});

it.each([{ok:true,delay:4000},{ok:false,delay:10000}])("retains the normal DCC processing cadence at $delay ms for ok=$ok",async({ok,delay})=>{
  vi.useFakeTimers();
  const timeouts=vi.spyOn(globalThis,"setTimeout");
  const fetcher=vi.fn().mockResolvedValue({ok});
  vi.stubGlobal("fetch",fetcher);
  render(<TransmittalCreateForm {...props} preparing={[{...row("5"),state:"processing",createdAt:"2026-10-16T10:00:00Z"}]}/>);
  await act(async()=>{await Promise.resolve();});
  expect(fetcher).toHaveBeenCalledOnce();
  expect(timeouts.mock.calls.filter(([,timeout])=>timeout===delay)).toHaveLength(1);
  await act(async()=>{await vi.advanceTimersByTimeAsync(delay-1);});
  expect(fetcher).toHaveBeenCalledOnce();
  await act(async()=>{await vi.advanceTimersByTimeAsync(1);});
  expect(fetcher).toHaveBeenCalledTimes(2);
  expect(fetcher).toHaveBeenLastCalledWith("/api/v1/organisations/org/projects/project/work-packages/transmittals/process",{method:"POST",cache:"no-store",signal:expect.any(AbortSignal)});
  expect(router.refresh).toHaveBeenCalledTimes(ok?2:0);
});

it("wraps long document numbers rather than truncating their identifying text", () => {
  const longNumber="PROJECT-DISCIPLINE-VERY-LONG-CONTROLLED-DOCUMENT-NUMBER-1234567890";
  render(<TransmittalCreateForm {...props} revisions={[{...row("3"),documentNumber:longNumber}]} />);
  const number=screen.getByText(longNumber);
  expect(number.className).toContain("[overflow-wrap:anywhere]");
  expect(number.className).not.toContain("truncate");
  expect(screen.getByRole("checkbox",{name:`Select ${longNumber} revision A01`})).toBeTruthy();
});
