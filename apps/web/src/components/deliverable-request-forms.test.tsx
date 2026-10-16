import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {NewDeliverableRequestForm,DeliverableRequestReviewForm,CancelDeliverableRequestForm} from "./deliverable-request-forms";
import {canReviewDeliverableRequest,type DeliverableRequest} from "@/lib/deliverable-requests";
import {submitDeliverableRequest,decideDeliverableRequest,cancelDeliverableRequest,type DeliverableRequestState} from "@/app/app/deliverable-request-actions";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
vi.mock("@/app/app/deliverable-request-actions",()=>({submitDeliverableRequest:vi.fn(),decideDeliverableRequest:vi.fn(),cancelDeliverableRequest:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
beforeEach(()=>vi.resetAllMocks());
afterEach(cleanup);
const scope={organisationId:"org",projectId:"project"};
const request={id:"request",kind:"additional_deliverable",status:"pending_dcc",requester_id:"engineer"} as DeliverableRequest;
describe("deliverable request forms",()=>{
  it("shows the current assigned deliverable and keeps new dates behind approvals",()=>{
    render(<NewDeliverableRequestForm {...scope} documents={[{id:"doc",document_number:"MEC-001",title:"Pump",due_date:"2026-10-01"}]} disciplines={["Mechanical"]} documentTypes={[]} selectedDocument="doc"/>);
    expect((screen.getByLabelText("Assigned deliverable") as HTMLSelectElement).value).toBe("doc");
    expect(screen.queryByText(/existing deadline stays in force/)).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button",{name:"Submission-date approval workflow"}));
    expect(screen.getByRole("tooltip").textContent).toContain("existing deadline stays in force");
    expect(screen.queryByLabelText(/document number/i)).toBeNull();
  });
  it("offers flexible types and only supplied PM-authorised disciplines for new deliverables",()=>{
    render(<NewDeliverableRequestForm {...scope} documents={[]} disciplines={["Mechanical","Electrical"]} documentTypes={[]}/>);
    fireEvent.click(screen.getByText("New request"));
    fireEvent.change(screen.getByLabelText("Request type"),{target:{value:"additional_deliverable"}});
    expect(screen.getByLabelText("Deliverable title")).toBeTruthy();
    expect(screen.getByLabelText("Document type").tagName).toBe("INPUT");
    expect(screen.getByLabelText("Planned first-issue date")).toBeTruthy();
    const options=Array.from((screen.getByLabelText("Authorised discipline") as HTMLSelectElement).options).map(option=>option.text);
    expect(options).toEqual(["Select your discipline","Mechanical","Electrical"]);
    expect(screen.queryByLabelText(/DCC-assigned document number/)).toBeNull();
    expect((screen.getByRole("button",{name:"Send request"}) as HTMLButtonElement).disabled).toBe(false);
  });
  it("requires DCC numbering only when approving additional scope",()=>{
    render(<DeliverableRequestReviewForm {...scope} request={request}/>);
    fireEvent.click(screen.getByText("Review request"));
    expect((screen.getByLabelText(/DCC-assigned document number/) as HTMLInputElement).required).toBe(true);
    fireEvent.change(screen.getByLabelText("Decision"),{target:{value:"reject"}});
    expect(screen.queryByLabelText(/DCC-assigned document number/)).toBeNull();
    expect((screen.getByLabelText("Reason for rejection") as HTMLTextAreaElement).required).toBe(true);
  });
  it("does not ask the PM to renumber a date-change request",()=>{
    render(<DeliverableRequestReviewForm {...scope} request={{...request,kind:"date_change",status:"pending_pm"}}/>);
    fireEvent.click(screen.getByText("Review request"));
    expect(screen.getByRole("option",{name:"Approve and send to DCC"})).toBeTruthy();expect(screen.queryByLabelText(/DCC-assigned/)).toBeNull();
  });
  it("shows decision controls only to the next reviewer and never to a preview or requester",()=>{
    expect(canReviewDeliverableRequest("project_admin",{...request,status:"pending_pm"},"pm")).toBe(true);
    expect(canReviewDeliverableRequest("document_controller",{...request,status:"pending_pm"},"dcc")).toBe(false);
    expect(canReviewDeliverableRequest("project_admin",request,"pm")).toBe(false);
    expect(canReviewDeliverableRequest("document_controller",request,"dcc")).toBe(true);
    expect(canReviewDeliverableRequest("document_controller",request,"dcc",true)).toBe(false);
    expect(canReviewDeliverableRequest("document_controller",request,"engineer")).toBe(false);
    expect(canReviewDeliverableRequest("document_controller",{...request,status:"accepted"},"dcc")).toBe(false);
  });
  it("keeps creation and review collapsed initially without discarding mounted fields",()=>{
    const {container}=render(<><NewDeliverableRequestForm {...scope} documents={[]} disciplines={[]} documentTypes={[]}/><DeliverableRequestReviewForm {...scope} request={request}/></>);
    const disclosures=container.querySelectorAll("details");
    expect(disclosures).toHaveLength(2);expect(Array.from(disclosures).every(item=>!item.open)).toBe(true);
    expect(container.querySelector('select[name="kind"]')).toBeTruthy();expect(container.querySelector('select[name="decision"]')).toBeTruthy();
    expect(submitDeliverableRequest).not.toHaveBeenCalled();expect(decideDeliverableRequest).not.toHaveBeenCalled();
  });
  it("opens creation for a deliverable deep-link and preserves submission-date payload and validation",async()=>{
    vi.mocked(submitDeliverableRequest).mockResolvedValue({ok:true,message:"Request submitted."});
    const {container}=render(<NewDeliverableRequestForm {...scope} documents={[{id:"doc",document_number:"MEC-001",title:"Pump",due_date:"2026-10-01"}]} disciplines={["Mechanical"]} documentTypes={[]} selectedDocument="doc"/>);
    expect(container.querySelector("details")?.open).toBe(true);
    const date=screen.getByLabelText("Requested submission date") as HTMLInputElement;
    expect(date.required).toBe(true);expect(date.type).toBe("date");expect(date.min).toBe(new Date().toISOString().slice(0,10));
    const reason=screen.getByLabelText("Reason for request") as HTMLTextAreaElement;
    expect(reason.required).toBe(true);expect(reason.minLength).toBe(5);expect(reason.maxLength).toBe(2000);
    fireEvent.change(date,{target:{value:"2026-12-01"}});fireEvent.change(reason,{target:{value:"Waiting for supplier data"}});
    const form=screen.getByRole("form",{name:"New deliverable request"}) as HTMLFormElement;
    expect(screen.getByRole("button",{name:"Send request"}).classList.contains("min-h-11")).toBe(true);
    await act(async()=>{fireEvent.submit(form);});
    expect(Object.fromEntries(vi.mocked(submitDeliverableRequest).mock.calls[0][1])).toEqual({...scope,kind:"date_change",documentId:"doc",requestedDate:"2026-12-01",reason:"Waiting for supplier data"});
    expect(screen.getByRole("status").textContent).toBe("Request submitted.");
  });
  it("preserves flexible document types and additional-deliverable payloads",async()=>{
    vi.mocked(submitDeliverableRequest).mockResolvedValue({ok:true,message:"Additional deliverable requested."});
    render(<NewDeliverableRequestForm {...scope} documents={[]} disciplines={["Mechanical"]} documentTypes={[{code:"DRG",name:"Drawing"}]}/>);
    fireEvent.click(screen.getByText("New request"));fireEvent.change(screen.getByLabelText("Request type"),{target:{value:"additional_deliverable"}});
    const title=screen.getByLabelText("Deliverable title") as HTMLInputElement;
    expect(title.minLength).toBe(2);expect(title.maxLength).toBe(240);expect(title.required).toBe(true);
    const documentType=screen.getByLabelText("Document type") as HTMLInputElement;
    expect(documentType.maxLength).toBe(80);expect(documentType.required).toBe(true);
    fireEvent.change(title,{target:{value:"Vendor data list"}});fireEvent.change(documentType,{target:{value:"Custom engineering list"}});fireEvent.change(screen.getByLabelText("Authorised discipline"),{target:{value:"Mechanical"}});fireEvent.change(screen.getByLabelText("Planned first-issue date"),{target:{value:"2026-12-01"}});fireEvent.change(screen.getByLabelText("Reason for request"),{target:{value:"New scope agreed with the client"}});
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"New deliverable request"}));});
    expect(Object.fromEntries(vi.mocked(submitDeliverableRequest).mock.calls[0][1])).toEqual({...scope,kind:"additional_deliverable",title:"Vendor data list",documentType:"Custom engineering list",discipline:"Mechanical",requestedDate:"2026-12-01",reason:"New scope agreed with the client"});
  });
  it("reopens creation for validation errors and server feedback even after the panel is closed",async()=>{
    vi.mocked(submitDeliverableRequest).mockResolvedValue({message:"The request could not be sent."});
    const {container}=render(<NewDeliverableRequestForm {...scope} documents={[]} disciplines={[]} documentTypes={[]}/>);
    const disclosure=container.querySelector("details")!;
    fireEvent.invalid(screen.getByLabelText("Requested submission date"));expect(disclosure.open).toBe(true);
    disclosure.open=false;
    await act(async()=>{fireEvent.submit(container.querySelector("form")!);});
    expect(disclosure.open).toBe(true);expect(screen.getByRole("alert").textContent).toBe("The request could not be sent.");
  });
  it("announces a pending request and prevents duplicate submission",async()=>{
    let finish!:(state:DeliverableRequestState)=>void;
    vi.mocked(submitDeliverableRequest).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    const {container}=render(<NewDeliverableRequestForm {...scope} documents={[{id:"doc",document_number:"MEC-001",title:"Pump",due_date:"2026-10-01"}]} disciplines={[]} documentTypes={[]}/>);
    await act(async()=>{fireEvent.submit(container.querySelector("form")!);});
    expect(container.querySelector("details")?.open).toBe(true);expect(screen.getByRole("form",{name:"New deliverable request"}).getAttribute("aria-busy")).toBe("true");
    expect((screen.getByRole("button",{name:"Sending…"}) as HTMLButtonElement).disabled).toBe(true);
    await act(async()=>{finish({ok:true,message:"Request submitted."});});
    expect(screen.getByRole("form",{name:"New deliverable request"}).getAttribute("aria-busy")).toBe("false");
  });
  it("preserves DCC numbering and reviewer payloads and reopens review errors",async()=>{
    vi.mocked(decideDeliverableRequest).mockResolvedValue({message:"That document number is already in the MDR."});
    const {container}=render(<DeliverableRequestReviewForm {...scope} request={request}/>);
    const disclosure=container.querySelector("details")!;
    fireEvent.click(screen.getByText("Review request"));
    const number=screen.getByLabelText(/DCC-assigned document number/) as HTMLInputElement;
    expect(number.minLength).toBe(2);expect(number.maxLength).toBe(80);expect(number.autocomplete).toBe("off");
    fireEvent.change(number,{target:{value:"MEC-002"}});fireEvent.change(screen.getByLabelText("Review comment (optional)"),{target:{value:"Scope checked"}});
    disclosure.open=false;
    await act(async()=>{fireEvent.submit(container.querySelector("form")!);});
    expect(disclosure.open).toBe(true);expect(screen.getByRole("alert").textContent).toContain("already in the MDR");
    expect(Object.fromEntries(vi.mocked(decideDeliverableRequest).mock.calls[0][1])).toEqual({...scope,requestId:"request",decision:"approve",documentNumber:"MEC-002",comment:"Scope checked"});
  });
  it("keeps rejection reasons required and excludes numbering when rejecting",async()=>{
    vi.mocked(decideDeliverableRequest).mockResolvedValue({ok:true,message:"Request rejected."});
    render(<DeliverableRequestReviewForm {...scope} request={request}/>);fireEvent.click(screen.getByText("Review request"));
    fireEvent.change(screen.getByLabelText("Decision"),{target:{value:"reject"}});
    const reason=screen.getByLabelText("Reason for rejection") as HTMLTextAreaElement;
    expect(reason.required).toBe(true);expect(reason.minLength).toBe(5);expect(reason.maxLength).toBe(2000);
    fireEvent.change(reason,{target:{value:"This deliverable duplicates existing scope"}});
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Review deliverable request"}));});
    expect(Object.fromEntries(vi.mocked(decideDeliverableRequest).mock.calls[0][1])).toEqual({...scope,requestId:"request",decision:"reject",comment:"This deliverable duplicates existing scope"});
  });
  it("preserves cancellation scope and announces its result",async()=>{
    vi.mocked(cancelDeliverableRequest).mockResolvedValue({ok:true,message:"Request cancelled."});
    render(<CancelDeliverableRequestForm {...scope} requestId="request"/>);
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Cancel deliverable request"}));});
    expect(Object.fromEntries(vi.mocked(cancelDeliverableRequest).mock.calls[0][1])).toEqual({...scope,requestId:"request"});expect(screen.getByRole("status").textContent).toBe("Request cancelled.");
  });
  it("keeps native disclosures usable but blocks every mutation inside audited preview",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"engineer",displayName:"Engineer",disciplines:["Mechanical"],expiresAt:"2099-01-01"}}><NewDeliverableRequestForm {...scope} documents={[{id:"doc",document_number:"MEC-001",title:"Pump",due_date:"2026-10-01"}]} disciplines={["Mechanical"]} documentTypes={[]}/><DeliverableRequestReviewForm {...scope} request={request}/><CancelDeliverableRequestForm {...scope} requestId="request"/></AdminPreviewBoundary>);
    fireEvent.click(screen.getByText("New request"));fireEvent.click(screen.getByText("Review request"));
    for(const name of ["Send request","Confirm decision","Cancel request"])expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByRole("form",{name:"New deliverable request"}));fireEvent.submit(screen.getByRole("form",{name:"Review deliverable request"}));fireEvent.submit(screen.getByRole("form",{name:"Cancel deliverable request"}));
    expect(submitDeliverableRequest).not.toHaveBeenCalled();expect(decideDeliverableRequest).not.toHaveBeenCalled();expect(cancelDeliverableRequest).not.toHaveBeenCalled();
  });
});
