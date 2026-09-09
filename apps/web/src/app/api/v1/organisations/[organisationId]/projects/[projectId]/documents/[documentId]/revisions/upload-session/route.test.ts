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
const rpc=vi.fn(),insert=vi.fn(),sign=vi.fn(),single=vi.fn();
const query={select:vi.fn(),eq:vi.fn(),in:vi.fn(),limit:vi.fn(),maybeSingle:single};
const supabase={rpc,from:vi.fn((table:string)=>table==="document_revisions"||table==="upload_sessions"?{...query,insert}:query),storage:{from:vi.fn(()=>({createSignedUploadUrl:sign}))}};
const get=(code="A")=>GET(new Request(`https://app.example.test/upload?revisionCode=${encodeURIComponent(code)}`),{params:Promise.resolve(params)});
const post=(data:unknown=body)=>POST(new Request("https://app.example.test/upload",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(data)}),{params:Promise.resolve(params)});
beforeEach(()=>{
  vi.clearAllMocks();vi.mocked(requireProject).mockResolvedValue({supabase,access:{role:"engineer"}} as never);vi.mocked(rateLimited).mockResolvedValue(false);
  rpc.mockResolvedValue({data:true,error:null});insert.mockResolvedValue({error:null});sign.mockResolvedValue({data:{path:"private/path",token:"test-token"},error:null});single.mockResolvedValue({data:{delivery_stage:"feed"},error:null});
  query.select.mockReturnValue(query);query.eq.mockReturnValue(query);query.in.mockReturnValue(query);query.limit.mockReturnValue(query);
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
