// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {submitDeliverableRequest,decideDeliverableRequest,cancelDeliverableRequest} from "./deliverable-request-actions";
import {requireProject} from "@/lib/auth";
import {revalidatePath} from "next/cache";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const rpc=vi.fn();
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="b0000000-0000-4000-8000-000000000001",documentId="c0000000-0000-4000-8000-000000000001",requestId="d0000000-0000-4000-8000-000000000001";
const futureDate=()=>new Date(Date.now()+30*86400000).toISOString().slice(0,10);
function access(role="engineer",preview=false){vi.mocked(requireProject).mockResolvedValue({access:{role},supabase:{rpc},preview:preview?{}:null} as never);}
function form(values:Record<string,string>={}){const data=new FormData();Object.entries({organisationId,projectId,kind:"date_change",documentId,requestedDate:futureDate(),reason:"Vendor input is delayed",...values}).forEach(([key,value])=>data.set(key,value));return data;}
function review(values:Record<string,string>={}){return form({requestId,decision:"approve",comment:"",...values});}
beforeEach(()=>{vi.clearAllMocks();access();rpc.mockResolvedValue({data:"accepted",error:null});});
describe("deliverable requests server actions",()=>{
  it("sends the date request using the authenticated scoped client",async()=>{
    expect((await submitDeliverableRequest({},form())).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("request_submission_date_change",{target_organisation:organisationId,target_project:projectId,target_document:documentId,new_date:futureDate(),request_reason:"Vendor input is delayed"});
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}`,"layout");
  });
  it("allows an unlisted document type without asking the engineer for a document number",async()=>{
    expect((await submitDeliverableRequest({},form({kind:"additional_deliverable",title:"New deliverable",documentType:"Custom special report",discipline:"Electrical"}))).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("request_additional_deliverable",expect.objectContaining({new_type:"Custom special report",new_discipline:"Electrical"}));
    expect(rpc.mock.calls[0][1]).not.toHaveProperty("new_document_number");
  });
  it.each(["project_admin","document_controller","organisation_admin","viewer"])("denies creation as %s",async role=>{access(role);expect((await submitDeliverableRequest({},form())).ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();});
  it.each(["","garbage","2026-13-01","2026-02-30","2000-01-01","9999-01-01"])("rejects invalid date %s",async requestedDate=>{
    expect((await submitDeliverableRequest({},form({requestedDate}))).ok).not.toBe(true);expect(requireProject).not.toHaveBeenCalled();
  });
  it("blocks member-preview mutations for all three actions",async()=>{
    access("engineer",true);expect((await submitDeliverableRequest({},form())).message).toContain("read-only");
    expect((await cancelDeliverableRequest({},review())).message).toContain("read-only");
    access("document_controller",true);expect((await decideDeliverableRequest({},review())).message).toContain("read-only");expect(rpc).not.toHaveBeenCalled();
  });
  it("PM approval remains explicitly pending DCC",async()=>{
    access("project_admin");rpc.mockResolvedValue({data:"pending_dcc",error:null});
    expect((await decideDeliverableRequest({},review())).message).toContain("DCC acceptance is still required");
  });
  it("passes DCC number to the atomic approval RPC",async()=>{
    access("document_controller");await decideDeliverableRequest({},review({documentNumber:" MEC-002 "}));
    expect(rpc).toHaveBeenCalledWith("review_deliverable_request",{target_organisation:organisationId,target_project:projectId,target_request:requestId,decision:"approve",review_comment:"",new_document_number:"MEC-002"});
  });
  it("does not claim a duplicate MDR number was accepted",async()=>{
    access("document_controller");rpc.mockResolvedValue({error:{code:"23505"}});
    const result=await decideDeliverableRequest({},review({documentNumber:"MEC-001"}));expect(result.ok).not.toBe(true);expect(result.message).toContain("already used");expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("explains a stale request and refreshes the queue",async()=>{
    access("document_controller");rpc.mockResolvedValue({data:"superseded",error:null});
    expect((await decideDeliverableRequest({},review())).message).toContain("fresh request");expect(revalidatePath).toHaveBeenCalled();
  });
  it("requires a reason for rejecting",async()=>{
    access("project_admin");expect((await decideDeliverableRequest({},review({decision:"reject"}))).ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();
  });
  it.each(["engineer","organisation_admin","viewer"])("denies approval as %s",async role=>{access(role);expect((await decideDeliverableRequest({},review())).ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();});
  it("cancels through the owner-checked RPC",async()=>{
    expect((await cancelDeliverableRequest({},review())).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("cancel_deliverable_request",{target_organisation:organisationId,target_project:projectId,target_request:requestId});
  });
  it("returns a safe failure instead of raw database output",async()=>{
    rpc.mockResolvedValue({error:{code:"XX000",message:"private provider details"}});
    const result=await submitDeliverableRequest({},form());expect(result.ok).not.toBe(true);expect(result.message).not.toContain("private provider details");
  });
});
