import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import DeliverableRequestsPage from "./page";
import {requireProject} from "@/lib/auth";
import {loadDocumentSchedules} from "@/lib/document-schedule";
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn(()=>{throw new Error("redirect")})}));
vi.mock("@/app/app/deliverable-request-actions",()=>({submitDeliverableRequest:vi.fn(),decideDeliverableRequest:vi.fn(),cancelDeliverableRequest:vi.fn()}));
const org="a0000000-0000-4000-8000-000000000001",project="b0000000-0000-4000-8000-000000000001",id="c0000000-0000-4000-8000-000000000001";
const req={id,kind:"date_change",status:"pending_pm",requester_id:"engineer",document_id:"doc",document_number:"MEC-001",title:"Pump plan",document_type:"Drawing",discipline:"Mechanical",requested_date:"2026-10-05",previous_due_date:"2026-09-10",reason:"Waiting for vendor input",created_at:"2026-09-08T10:00:00Z",pm_reviewed_at:null,dcc_reviewed_at:null};
function setup(role="project_admin",preview=false,overrides:Record<string,unknown>={},result:{data?:unknown[];count?:number}={}){
  const query:Record<string,ReturnType<typeof vi.fn>>={};
  for(const method of ["select","eq","in","order","range"])query[method]=vi.fn(()=>query);
  query.then=vi.fn(resolve=>Promise.resolve({data:result.data??[{...req,...overrides}],error:null,count:result.count??1}).then(resolve));
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
    fireEvent.click(screen.getByText("New request"));
    expect(screen.getByRole("option",{name:/MEC-001 · Retained drawing/})).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Request type"),{target:{value:"additional_deliverable"}});
    expect(screen.queryByRole("option",{name:"Mechanical"})).toBeNull();
    expect(screen.getByRole("option",{name:"Process"})).toBeTruthy();
  });
  it("shows PM the requesting engineer and approval form",async()=>{
    setup();render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    expect(screen.getByRole("heading",{name:"Pump plan"})).toBeTruthy();
    expect(screen.getByText(/Engineer Ada/)).toBeTruthy();
    fireEvent.click(screen.getByText("Review request"));
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
  it("uses the shared compact heading, slim navigation and latest-first scoped query",async()=>{
    const query=setup();render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    const heading=screen.getByRole("heading",{name:"Deliverable requests",level:1});
    expect(heading.className).toContain("text-2xl");
    expect(screen.getByRole("link",{name:"Project dashboard"}).className).toContain("min-h-11");
    expect(screen.getByRole("link",{name:"Open requests"}).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link",{name:"Decision history"}).getAttribute("aria-current")).toBeNull();
    expect(query.eq).toHaveBeenCalledWith("organisation_id",org);expect(query.eq).toHaveBeenCalledWith("project_id",project);
    expect(query.order).toHaveBeenNthCalledWith(1,"created_at",{ascending:false});expect(query.order).toHaveBeenNthCalledWith(2,"id");expect(query.range).toHaveBeenCalledWith(0,24);
    expect(screen.getByText("1 open request")).toBeTruthy();
  });
  it("keeps status, identity and dates visible while collapsing reasons, comments and decision fields",async()=>{
    setup("document_controller",false,{status:"pending_dcc",pm_reviewed_at:"2026-09-09T10:00:00Z",pm_comment:"Date accepted by the project manager"});
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    const article=screen.getByRole("article",{name:"Pump plan"});
    expect(within(article).getByText("Awaiting DCC acceptance").closest("details")).toBeNull();
    expect(within(article).getByText("Requested submission").closest("details")).toBeNull();
    expect(within(article).getByText("Current date at request").closest("details")).toBeNull();
    expect(within(article).getByText("PM reviewed").closest("details")).toBeNull();
    const reason=within(article).getByText("Waiting for vendor input");
    expect(reason.closest("details")?.open).toBe(false);expect(within(article).getByText("Date accepted by the project manager").closest("details")?.open).toBe(false);
    const review=within(article).getByText("Review request").closest("details")!;
    expect(review.open).toBe(false);expect(review.querySelector('form[aria-label="Review deliverable request"] button[type="submit"], form[aria-label="Review deliverable request"] button:not([type])')).toBeTruthy();
    fireEvent.click(within(article).getByText("Request details"));expect(reason.closest("details")?.open).toBe(true);
    fireEvent.click(within(article).getByText("Review request"));expect(within(article).getByRole("option",{name:"Accept new submission date"})).toBeTruthy();
  });
  it("preserves selected-request routing and provides an explicit return to the queue",async()=>{
    const query=setup("document_controller",false,{status:"accepted",dcc_reviewed_at:"2026-09-09T10:00:00Z",dcc_comment:"Registered"});
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({request:id,view:"history",page:"999"})}));
    expect(query.eq).toHaveBeenCalledWith("id",id);expect(query.in).not.toHaveBeenCalled();expect(query.range).toHaveBeenCalledWith(0,24);
    expect(screen.getByText("Selected request")).toBeTruthy();
    expect(screen.getByRole("link",{name:/View all decided requests/}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/requests?view=history`);
    expect(screen.getByRole("link",{name:"Open MDR deliverable →"}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/documents/doc`);
    expect(screen.getByText("DCC reviewed").closest("details")).toBeNull();
  });
  it("keeps long request identifiers wrappable without changing stored text",async()=>{
    const title="DeliverableTitle".repeat(30);
    setup("project_admin",false,{title});render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    const article=screen.getByRole("article",{name:title});expect(article.className).toContain("[overflow-wrap:anywhere]");expect(within(article).getByRole("heading",{name:title})).toBeTruthy();
  });
  it("keeps both open stages as the PM default and offers accessible GET stage filters",async()=>{
    const query=setup();render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({})}));
    expect(query.in).toHaveBeenCalledWith("status",["pending_pm","pending_dcc"]);
    const filters=screen.getByRole("navigation",{name:"Open request review stage"});
    expect(within(filters).getByRole("link",{name:"All open"}).getAttribute("aria-current")).toBe("page");
    expect(within(filters).getByRole("link",{name:"Needs my review"}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/requests?view=open&queue=pm_review`);
    expect(within(filters).getByRole("link",{name:"Awaiting DCC"}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/requests?view=open&queue=dcc`);
    expect([...filters.querySelectorAll("a")].every(link=>link.className.includes("min-h-11"))).toBe(true);
    expect(filters.querySelector("form,button")).toBeNull();
  });
  it.each([["pm_review","pending_pm","Needs my review"],["dcc","pending_dcc","Awaiting DCC"]])("filters %s on the server before pagination and retains it in page links",async(queue,status,label)=>{
    const query=setup("project_admin",false,{status},{count:80});
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({queue,page:"2"})}));
    expect(query.in).toHaveBeenCalledWith("status",[status]);expect(query.range).toHaveBeenCalledWith(25,49);
    expect(screen.getByRole("link",{name:label}).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link",{name:"← Previous"}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/requests?view=open&queue=${queue}`);
    expect(screen.getByRole("link",{name:"Next →"}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/requests?view=open&queue=${queue}&page=3`);
    if(queue==="dcc")expect(screen.queryByText("Review request")).toBeNull();
  });
  it("explains the empty PM review queue without describing requests awaiting DCC as PM work",async()=>{
    const query=setup("project_admin",false,{}, {data:[],count:0});
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({queue:"pm_review"})}));
    expect(query.in).toHaveBeenCalledWith("status",["pending_pm"]);
    expect(screen.getByText("No requests are awaiting Project Manager review.")).toBeTruthy();
    expect(screen.getByText("0 requests awaiting PM review")).toBeTruthy();
    expect(screen.queryByText("No open requests.")).toBeNull();
  });
  it("keeps PM stage filters useful but read-only in an audited preview",async()=>{
    const query=setup("project_admin",true);render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({queue:"pm_review"})}));
    expect(query.in).toHaveBeenCalledWith("status",["pending_pm"]);
    expect(screen.getByRole("link",{name:"Needs PM review"}).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("link",{name:"Needs my review"})).toBeNull();
    expect(screen.queryByText("Review request")).toBeNull();expect(screen.queryByText("New request")).toBeNull();
  });
  it("preserves the self-review guard within the PM review stage",async()=>{
    setup("project_admin",false,{requester_id:"reviewer"});render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({queue:"pm_review"})}));
    expect(screen.queryByText("Review request")).toBeNull();
  });
  it.each(["document_controller","engineer"])("does not apply PM-only filters to %s queues",async role=>{
    const query=setup(role,true);render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({queue:"pm_review",page:"2"})}));
    expect(query.in).toHaveBeenCalledWith("status",["pending_pm","pending_dcc"]);expect(query.range).toHaveBeenCalledWith(25,49);
    expect(screen.queryByRole("navigation",{name:"Open request review stage"})).toBeNull();
    if(role==="engineer")expect(query.eq).toHaveBeenCalledWith("requester_id","engineer");
  });
  it("ignores stale PM stage filters in decision history and keeps history pagination",async()=>{
    const query=setup("project_admin",false,{status:"accepted"},{count:80});
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({view:"history",queue:"pm_review",page:"2"})}));
    expect(query.in).toHaveBeenCalledWith("status",["accepted","rejected","cancelled","superseded"]);
    expect(screen.queryByRole("navigation",{name:"Open request review stage"})).toBeNull();
    expect(screen.getByRole("link",{name:"Next →"}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/requests?view=history&page=3`);
  });
  it("leaves selected-request links independent of stage filtering and returns to the chosen queue",async()=>{
    const query=setup("project_admin",false,{status:"accepted"});
    render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({queue:"dcc",request:id,page:"9"})}));
    expect(query.eq).toHaveBeenCalledWith("id",id);expect(query.in).not.toHaveBeenCalled();expect(query.range).toHaveBeenCalledWith(0,24);
    expect(screen.getByText("Accepted by DCC")).toBeTruthy();
    expect(screen.queryByRole("navigation",{name:"Open request review stage"})).toBeNull();
    expect(screen.getByRole("link",{name:/View all requests awaiting DCC/}).getAttribute("href")).toBe(`/app/${org}/projects/${project}/requests?view=open&queue=dcc`);
  });
  it("normalises unknown queue filters to the unchanged open view",async()=>{
    const query=setup();render(await DeliverableRequestsPage({params,searchParams:Promise.resolve({queue:"anything"})}));
    expect(query.in).toHaveBeenCalledWith("status",["pending_pm","pending_dcc"]);
    expect(screen.getByRole("link",{name:"All open"}).getAttribute("aria-current")).toBe("page");
  });
  it.each(["organisation_admin","member","executive"])("retains the existing redirect for unsupported role %s",async role=>{
    setup(role);await expect(DeliverableRequestsPage({params,searchParams:Promise.resolve({})})).rejects.toThrow("redirect");
  });
});
