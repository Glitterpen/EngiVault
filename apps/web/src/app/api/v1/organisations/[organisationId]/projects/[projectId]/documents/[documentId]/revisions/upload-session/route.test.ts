// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {GET,POST} from "./route";
import {requireProject} from "@/lib/auth";
import {rateLimited} from "@/lib/rate-limit";
import {TRANSMITTED_OVERRIDE_WARNING} from "@/lib/submission-override";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/rate-limit",()=>({rateLimited:vi.fn()}));
const params={organisationId:"a0000000-0000-4000-8000-000000000001",projectId:"b0000000-0000-4000-8000-000000000001",documentId:"c0000000-0000-4000-8000-000000000001"};
const target="d0000000-0000-4000-8000-000000000001";
const body={revisionCode:"A",issueStatus:"Issued for Review (IFR)",fileName:"drawing.pdf",mimeType:"application/pdf",size:10,sha256:"a".repeat(64)};
const predecessor=(id:string,issue_status:string,created_at="2026-09-01T12:00:00Z")=>({id,issue_status,created_at,reviewed_at:null,control_status:"accepted",state:"ready",overridden_by_revision_id:null});
const rpc=vi.fn(),insert=vi.fn(),sign=vi.fn(),single=vi.fn(),predecessorRead=vi.fn();
const query={select:vi.fn(),eq:vi.fn(),in:vi.fn(),is:vi.fn(),order:vi.fn(),range:predecessorRead,limit:vi.fn(),maybeSingle:single};
const supabase={rpc,from:vi.fn((table:string)=>table==="document_revisions"||table==="upload_sessions"?{...query,insert}:query),storage:{from:vi.fn(()=>({createSignedUploadUrl:sign}))}};
const get=(code="A")=>GET(new Request(`https://app.example.test/upload?revisionCode=${encodeURIComponent(code)}`),{params:Promise.resolve(params)});
const post=(data:unknown=body)=>POST(new Request("https://app.example.test/upload",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}),{params:Promise.resolve(params)});
beforeEach(()=>{
  vi.clearAllMocks();vi.mocked(requireProject).mockResolvedValue({supabase,access:{role:"engineer"}} as never);vi.mocked(rateLimited).mockResolvedValue(false);
  rpc.mockResolvedValue({data:true,error:null});insert.mockResolvedValue({error:null});sign.mockResolvedValue({data:{path:"private/path",token:"test-token"},error:null});single.mockResolvedValue({data:{delivery_stage:"feed"},error:null});
  predecessorRead.mockReset();predecessorRead.mockResolvedValue({data:[predecessor("ifr","Issued for Review (IFR)"),predecessor("ifa","Issued for Approval (IFA)")],error:null,count:2});
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.in.mockReturnValue(query);query.is.mockReturnValue(query);query.order.mockReturnValue(query);query.limit.mockReturnValue(query);
});
describe("override eligibility API",()=>{
  it("returns private uncached tenant-scoped eligibility",async()=>{
    rpc.mockResolvedValue({data:{allowed:true,revisionId:target,issueStatus:body.issueStatus},error:null});const response=await get();
    expect(response.status).toBe(200);expect(response.headers.get("cache-control")).toContain("no-store");
    expect(rpc).toHaveBeenCalledWith("get_submission_override_context",{target_organisation:params.organisationId,target_project:params.projectId,target_document:params.documentId,requested_code:"A"});
    expect((await response.json()).revisionId).toBe(target);expect(insert).not.toHaveBeenCalled();
  });
  it("maps the transmitted status to the requested warning",async()=>{rpc.mockResolvedValue({data:{allowed:false,reason:"override_already_transmitted"},error:null});expect((await (await get()).json()).message).toBe(TRANSMITTED_OVERRIDE_WARNING);});
  it("blocks DCC callers",async()=>{vi.mocked(requireProject).mockResolvedValue({supabase,access:{role:"document_controller"}} as never);expect((await get()).status).toBe(403);expect(rpc).not.toHaveBeenCalled();});
  it("rejects missing code",async()=>{expect((await get("")).status).toBe(422);expect(rpc).not.toHaveBeenCalled();});
  it("does not leak internal database errors",async()=>{rpc.mockResolvedValue({data:null,error:{code:"XX000",message:"private details"}});const response=await get();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private details");});
});
describe("secure upload registration",()=>{
  it("sends only the selected original ID and creates a new immutable storage path",async()=>{
    const response=await post({...body,overrideRevisionId:target,submission_version:999,control_status:"accepted"});expect(response.status).toBe(201);
    const record=insert.mock.calls[0][0];expect(record.replaces_revision_id).toBe(target);expect(record.control_status).toBe("submitted");expect(record).not.toHaveProperty("submission_version");
    expect(record.id).not.toBe(target);expect(record.storage_key).toContain(`/revisions/${record.id}/drawing.pdf`);expect(sign).toHaveBeenCalledWith(record.storage_key,{upsert:false});
  });
  it("keeps normal uploads available without override",async()=>{expect((await post()).status).toBe(201);expect(insert.mock.calls[0][0].replaces_revision_id).toBeNull();});
  it("does not sign a file after a database transmission conflict",async()=>{
    insert.mockResolvedValue({error:{code:"55000",message:"override_already_transmitted"}});const response=await post({...body,overrideRevisionId:target});expect(response.status).toBe(409);expect((await response.json()).error.message).toBe(TRANSMITTED_OVERRIDE_WARNING);expect(sign).not.toHaveBeenCalled();
  });
  it("requires a valid original ID",async()=>{expect((await post({...body,overrideRevisionId:"not-a-uuid"})).status).toBe(422);expect(insert).not.toHaveBeenCalled();});
  it("retains required native-source validation for overrides",async()=>{const response=await post({...body,issueStatus:"Issued for Design (IFD)",overrideRevisionId:target});expect(response.status).toBe(422);expect(insert).not.toHaveBeenCalled();});
  it("denies engineers outside the document assignment",async()=>{rpc.mockResolvedValue({data:false,error:null});expect((await post({...body,overrideRevisionId:target})).status).toBe(403);expect(sign).not.toHaveBeenCalled();});
});

describe("strict completed controlled issue sequence",()=>{
  const terminalBody=(issueStatus="Issued for Design (IFD)")=>({...body,issueStatus,fileName:"design.docx",mimeType:"application/vnd.openxmlformats-officedocument.wordprocessingml.document"});
  it("requires a completed IFR before IFA and returns no signed URL on failure",async()=>{
    predecessorRead.mockResolvedValue({data:[],error:null,count:0});
    const response=await post({...body,issueStatus:"Issued for Approval (IFA)"});
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain("Issued for Review (IFR)");
    expect(insert).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
  });
  it.each(["Issued for Design (IFD)","Issued for Construction (IFC)"])("does not unlock %s from legacy IFA alone",async issueStatus=>{
    predecessorRead.mockResolvedValue({data:[predecessor("ifa","Issued for Approval (IFA)")],error:null,count:1});
    const response=await post(terminalBody(issueStatus));
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain("Issued for Review (IFR)");
    expect(insert).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
  });
  it.each(["Issued for Design (IFD)","Issued for Construction (IFC)"])("requires the completed IFA as well as IFR for %s",async issueStatus=>{
    predecessorRead.mockResolvedValue({data:[predecessor("ifr","Issued for Review (IFR)")],error:null,count:1});
    const response=await post(terminalBody(issueStatus));
    expect(response.status).toBe(409);
    expect((await response.json()).error.message).toContain("Issued for Approval (IFA)");
    expect(insert).not.toHaveBeenCalled();
  });
  it("matches canonical completed labels with case and outer whitespace normalised",async()=>{
    predecessorRead.mockResolvedValue({data:[predecessor("ifr"," issued FOR review (ifr) "),predecessor("ifa"," ISSUED FOR APPROVAL (ifa) ")],error:null,count:2});
    expect((await post(terminalBody())).status).toBe(201);
    expect(query.eq).toHaveBeenCalledWith("organisation_id",params.organisationId);
    expect(query.eq).toHaveBeenCalledWith("project_id",params.projectId);
    expect(query.eq).toHaveBeenCalledWith("document_id",params.documentId);
    expect(query.in).toHaveBeenCalledWith("state",["ready","superseded"]);
    expect(query.eq).toHaveBeenCalledWith("control_status","accepted");
    expect(query.is).toHaveBeenCalledWith("overridden_by_revision_id",null);
    expect(query.select).toHaveBeenCalledWith("id,issue_status,created_at,reviewed_at,control_status,state,overridden_by_revision_id",{count:"exact"});
  });
  it("does not treat Approved / Final as a completed canonical IFA prerequisite",async()=>{
    predecessorRead.mockResolvedValue({data:[predecessor("ifr","Issued for Review (IFR)"),predecessor("final","Approved / Final")],error:null,count:2});
    expect((await post(terminalBody())).status).toBe(409);expect(insert).not.toHaveBeenCalled();
  });
  it("retains other issue-purpose behaviour without adding predecessor rules",async()=>{
    expect((await post({...body,issueStatus:"Issued for Information (IFI)"})).status).toBe(201);
    expect(predecessorRead).not.toHaveBeenCalled();
  });
  it("fails closed without leaking diagnostics if predecessor verification fails",async()=>{
    predecessorRead.mockResolvedValue({data:null,error:{message:"private database diagnostic"},count:null});
    const response=await post(terminalBody());
    expect(response.status).toBe(503);expect(await response.text()).not.toContain("private database diagnostic");
    expect(insert).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
  });
  it("pages eligible history until both prerequisites are found instead of trusting a row cap",async()=>{
    predecessorRead.mockResolvedValueOnce({data:Array.from({length:200},(_,index)=>predecessor(String(index),index===0?"Issued for Approval (IFA)":"Draft / Work in Progress")),error:null,count:201})
      .mockResolvedValueOnce({data:[predecessor("earlier-ifr","Issued for Review (IFR)")],error:null,count:201});
    expect((await post(terminalBody())).status).toBe(201);
    expect(predecessorRead.mock.calls).toEqual([[0,199],[200,399]]);
  });
  it("does not trust a changing or incomplete history while verifying the prerequisites",async()=>{
    predecessorRead.mockResolvedValueOnce({data:[predecessor("ifa","Issued for Approval (IFA)")],error:null,count:2})
      .mockResolvedValueOnce({data:[predecessor("ifr","Issued for Review (IFR)")],error:null,count:3});
    expect((await post(terminalBody())).status).toBe(503);
    expect(predecessorRead.mock.calls).toEqual([[0,199],[1,200]]);
    expect(insert).not.toHaveBeenCalled();
  });
  it("rejects a legacy IFA followed by IFR until a new correctly ordered IFA completes",async()=>{
    predecessorRead.mockResolvedValue({data:[predecessor("ifa","Issued for Approval (IFA)","2026-09-01T12:00:00Z"),predecessor("ifr","Issued for Review (IFR)","2026-09-02T12:00:00Z")],error:null,count:2});
    const response=await post(terminalBody());
    expect(response.status).toBe(409);expect((await response.json()).error.message).toContain("IFR before IFA");
    expect(insert).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
    predecessorRead.mockResolvedValue({data:[predecessor("ifa","IFA","2026-09-01T12:00:00Z"),predecessor("ifr"," IFR ","2026-09-02T12:00:00Z"),predecessor("new-ifa"," ifa ","2026-09-03T12:00:00Z")],error:null,count:3});
    expect((await post(terminalBody())).status).toBe(201);
  });
  it("still rejects a crafted acronym target instead of accepting it as a new status value",async()=>{
    expect((await post(terminalBody("IFD"))).status).toBe(422);
    expect(insert).not.toHaveBeenCalled();expect(predecessorRead).not.toHaveBeenCalled();
  });
  it("does not unlock IFA from a securely uploaded IFR still awaiting DCC acceptance",async()=>{
    predecessorRead.mockResolvedValue({data:[{...predecessor("ifr","IFR"),control_status:"submitted"}],error:null,count:1});
    const response=await post({...body,issueStatus:"Issued for Approval (IFA)"});
    expect(response.status).toBe(409);expect((await response.json()).error.message).toContain("DCC must accept IFR");
    expect(insert).not.toHaveBeenCalled();expect(sign).not.toHaveBeenCalled();
  });
  it("does not unlock IFD while IFA still awaits DCC acceptance",async()=>{
    predecessorRead.mockResolvedValue({data:[predecessor("ifr","IFR"),{...predecessor("ifa","IFA"),control_status:"submitted"}],error:null,count:2});
    expect((await post(terminalBody())).status).toBe(409);expect(insert).not.toHaveBeenCalled();
  });
  it("does not use a future DCC review timestamp to unlock the next stage",async()=>{
    predecessorRead.mockResolvedValue({data:[{...predecessor("ifr","IFR"),reviewed_at:"2099-10-01T12:00:00Z"}],error:null,count:1});
    expect((await post({...body,issueStatus:"Issued for Approval (IFA)"})).status).toBe(409);
    expect(insert).not.toHaveBeenCalled();
  });
});
