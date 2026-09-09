import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import DeliverableRequestsPage from "./page";
import {requireProject} from "@/lib/auth";
import {loadDocumentSchedules} from "@/lib/document-schedule";
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn(()=>{throw new Error("redirect")})}));
vi.mock("@/app/app/deliverable-request-actions",()=>({submitDeliverableRequest:vi.fn(),decideDeliverableRequest:vi.fn(),cancelDeliverableRequest:vi.fn()}));
const org="a0000000-0000-4000-8000-000000000001",project="b0000000-0000-4000-8000-000000000001",id="c0000000-0000-4000-8000-000000000001";
const req={id,kind:"date_change",status:"pending_pm",requester_id:"engineer",document_id:"doc",document_number:"MEC-001",title:"Pump plan",document_type:"Drawing",discipline:"Mechanical",requested_date:"2026-10-05",previous_due_date:"2026-09-10",reason:"Waiting for vendor input",created_at:"2026-09-08T10:00:00Z",pm_reviewed_at:null,dcc_reviewed_at:null};
function setup(role="project_admin",preview=false,overrides:Record<string,unknown>={}){
  const query:Record<string,ReturnType<typeof vi.fn>>={};
  for(const method of ["select","eq","in","order","range"])query[method]=vi.fn(()=>query);
  query.then=vi.fn(resolve=>Promise.resolve({data:[{...req,...overrides}],error:null,count:1}).then(resolve));
  vi.mocked(requireProject).mockResolvedValue({access:{role},user:{id:role==="engineer"?"engineer":"reviewer"},preview:preview?{}:null,supabase:{from:vi.fn(()=>query),rpc:vi.fn().mockResolvedValue({data:[{user_id:"engineer",display_name:"Engineer Ada"}],error:null})}} as never);
  return query;
}
const params=Promise.resolve({organisationId:org,projectId:project});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("deliverable request queues",()=>{
  it("retains date requests for removed disciplines but hides them from new deliverable selections",async()=>{
    function query(data:unknown[]){const chain:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve({data,error:null,count:0}).then(resolve)};for(const method of ["select","eq","in","order","range"])chain[method]=()=>chain;return chain;}
    const tables:Record<string,unknown[]>={deliverable_requests:[],project_member_disciplines:[{discipline:"Mechanical"},{discipline:"Process"}],document_assignments:[{document_id:"doc"}],documents:[{id:"doc",document_number:"MEC-001",title:"Retained drawing",discipline:"Mechanical"}]};
    vi.mocked(requireProject).mockResolvedValue({access:{role:"engineer"},user:{id:"engineer"},preview:null,supabase:{from:(table:string)=>query(tables[table]??[]),rpc:vi.fn().mockResolvedValue({data:[{kind:"discipline",code:"PRO",name:"Process"}],error:null})}} as never);
    vi.mocked(loadDocumentSchedules).mockResolvedValue(new Map([["doc",{next_submission_date:"2026-10-05"}]] ) as never);
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    expect(screen.getByRole("option",{name:/MEC-001 · Retained drawing/})).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Request type"),{target:{value:"additional_deliverable"}});
    expect(screen.queryByRole("option",{name:"Mechanical"})).toBeNull();
    expect(screen.getByRole("option",{name:"Process"})).toBeTruthy();
  });
  it("shows PM the requesting engineer and approval form",async()=>{
    setup();render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    expect(screen.getByRole("heading",{name:"Pump plan"})).toBeTruthy();
    expect(screen.getByText(/Engineer Ada/)).toBeTruthy();
    expect(screen.getByRole("option",{name:"Approve and send to DCC"})).toBeTruthy();
    expect(screen.queryByText("New request")).toBeNull();
  });
  it("does not let DCC bypass the pending PM stage",async()=>{
    setup("document_controller");render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    expect(screen.queryByRole("button",{name:"Confirm decision"})).toBeNull();
  });
  it("keeps the live member preview read-only",async()=>{
    setup("project_admin",true);render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    expect(screen.getByText(/Live member preview/)).toBeTruthy();expect(screen.queryByRole("button",{name:"Confirm decision"})).toBeNull();
  });
  it("deep-links to an accepted request without filtering it out of open requests",async()=>{
    const query=setup("document_controller",false,{status:"accepted",dcc_reviewed_at:"2026-09-09T10:00:00Z"});
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({request:id,page:"7"})}));
    expect(query.eq).toHaveBeenCalledWith("id",id);expect(query.in).not.toHaveBeenCalled();expect(query.range).toHaveBeenCalledWith(0,24);
    expect(screen.getByText("Accepted by DCC")).toBeTruthy();
  });
  it("filters engineer preview requests to that member only",async()=>{
    const query=setup("engineer",true);render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    expect(query.eq).toHaveBeenCalledWith("requester_id","engineer");
    expect(screen.queryByRole("button",{name:/Send request|Confirm decision|Cancel request/})).toBeNull();
    expect(screen.getAllByRole("button").every(button=>button.closest("[data-preview-safe]"))).toBe(true);
  });
  it("paginates decided history rather than loading every request",async()=>{
    const query=setup();render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({view:"history",page:"3"})}));
    expect(query.in).toHaveBeenCalledWith("status",["accepted","rejected","cancelled","superseded"]);expect(query.range).toHaveBeenCalledWith(50,74);
  });
});
