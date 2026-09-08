import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {NewDeliverableRequestForm,DeliverableRequestReviewForm} from "./deliverable-request-forms";
import {canReviewDeliverableRequest,type DeliverableRequest} from "@/lib/deliverable-requests";
vi.mock("@/app/app/deliverable-request-actions",()=>({submitDeliverableRequest:vi.fn(),decideDeliverableRequest:vi.fn(),cancelDeliverableRequest:vi.fn()}));
afterEach(cleanup);
const scope={organisationId:"org",projectId:"project"};
const request={id:"request",kind:"additional_deliverable",status:"pending_dcc",requester_id:"engineer"} as DeliverableRequest;
describe("deliverable request forms",()=>{
  it("shows the current assigned deliverable and keeps new dates behind approvals",()=>{
    render(<NewDeliverableRequestForm {...scope} documents={[{id:"doc",document_number:"MEC-001",title:"Pump",due_date:"2026-10-01"}]} disciplines={["Mechanical"]} documentTypes={[]} selectedDocument="doc"/>);
    expect((screen.getByLabelText("Assigned deliverable") as HTMLSelectElement).value).toBe("doc");
    expect(screen.getByText(/existing deadline stays in force/)).toBeTruthy();
    expect(screen.queryByLabelText(/document number/i)).toBeNull();
  });
  it("offers flexible types and only supplied PM-authorised disciplines for new deliverables",()=>{
    render(<NewDeliverableRequestForm {...scope} documents={[]} disciplines={["Mechanical","Electrical"]} documentTypes={[]}/>);
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
    expect((screen.getByLabelText(/DCC-assigned document number/) as HTMLInputElement).required).toBe(true);
    fireEvent.change(screen.getByLabelText("Decision"),{target:{value:"reject"}});
    expect(screen.queryByLabelText(/DCC-assigned document number/)).toBeNull();
    expect((screen.getByLabelText("Reason for rejection") as HTMLTextAreaElement).required).toBe(true);
  });
  it("does not ask the PM to renumber a date-change request",()=>{
    render(<DeliverableRequestReviewForm {...scope} request={{...request,kind:"date_change",status:"pending_pm"}}/>);
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
});
