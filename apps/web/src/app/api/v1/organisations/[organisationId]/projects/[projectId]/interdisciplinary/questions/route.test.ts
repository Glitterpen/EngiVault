// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {GET,POST} from "./route";
import {requireProject} from "@/lib/auth";
import {embedSearchQuery,generateGroundedAnswer} from "@/lib/processor";
import {rateLimited} from "@/lib/rate-limit";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/processor",()=>({embedSearchQuery:vi.fn(),generateGroundedAnswer:vi.fn()}));
vi.mock("@/lib/rate-limit",()=>({rateLimited:vi.fn()}));
const params={organisationId:"a0000000-0000-4000-8000-000000000001",projectId:"b0000000-0000-4000-8000-000000000001"};
const source={chunk_id:"chunk-1",document_id:"document-1",revision_id:"revision-1",document_number:"DOC-001",title:"Design basis",revision_code:"D01",issue_status:"Issued for Design (IFD)",submitted_at:"2026-10-01T09:00:00Z",locator_type:"page",page_number:4,sheet_name:null,cell_range:null,content:"Design pressure is 50 barg.",score:0.8};
const rpc=vi.fn();
const projectQuery={select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn()};
const from=vi.fn();
const generated={answer:"The design pressure is 50 barg [1].",grounded:true,source_ids:[1],model:"configured-model",provider_request_id:"request",input_tokens:120,output_tokens:20,latency_ms:50};
const post=(body:unknown={question:"What is the design pressure?",discipline:"Electrical",stage:"IFD"},scope=params)=>POST(new Request("https://app.example.test/questions",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),{params:Promise.resolve(scope)});
const get=(query="question=design+pressure&discipline=Electrical&stage=IFD")=>GET(new Request(`https://app.example.test/questions?${query}`),{params:Promise.resolve(params)});

beforeEach(()=>{
  vi.resetAllMocks();
  projectQuery.select.mockReturnValue(projectQuery);projectQuery.eq.mockReturnValue(projectQuery);projectQuery.maybeSingle.mockResolvedValue({data:{status:"active"},error:null});from.mockReturnValue(projectQuery);
  vi.mocked(requireProject).mockResolvedValue({supabase:{rpc,from},access:{role:"engineer"},preview:null} as never);
  vi.mocked(rateLimited).mockResolvedValue(false);
  vi.mocked(embedSearchQuery).mockResolvedValue([0.1,0.2]);
  vi.mocked(generateGroundedAnswer).mockResolvedValue({...generated});
  rpc.mockImplementation(async(name:string)=>name==="search_interdisciplinary_evidence"?{data:[source],error:null}:{data:"answer-id",error:null});
});

describe("approved-reference inline questions",()=>{
  it("retrieves only dedicated approved evidence, cites it and records usage without creating a generic chat scope",async()=>{
    const response=await post();expect(response.status).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(1,"search_interdisciplinary_evidence",{target_organisation:params.organisationId,target_project:params.projectId,query_text:"What is the design pressure?",query_embedding:"[0.1,0.2]",filter_discipline:"Electrical",filter_issue_purpose:"IFD",result_limit:10});
    expect(generateGroundedAnswer).toHaveBeenCalledWith(expect.stringContaining("What is the design pressure?\n\nAnswer format:"),[{content:expect.stringContaining("Issued for Design (IFD)")}]);
    expect(rpc).toHaveBeenNthCalledWith(2,"record_interdisciplinary_answer",expect.objectContaining({citations:[{chunk_id:"chunk-1",label:1,rank:1,score:0.8}],retrieved:[{chunk_id:"chunk-1",score:0.8}],filter_discipline:"Electrical",filter_issue_purpose:"IFD"}));
    const body=await response.json();expect(body.sources[0]).toMatchObject({documentNumber:"DOC-001",revisionId:"revision-1",revision:"D01",issueStatus:"Issued for Design (IFD)",page:4});
    expect(response.headers.get("cache-control")).toContain("no-store");
  });
  it("preserves the supplied retry identifier for secure recording",async()=>{
    const requestId="c0000000-0000-4000-8000-000000000001";
    await post({question:"design pressure",requestId});
    expect(rpc).toHaveBeenCalledWith("record_interdisciplinary_answer",expect.objectContaining({request_id:requestId}));
  });
  it("supports no-AI excerpt search without embedding, generation or answer writes",async()=>{
    const response=await post({question:"design pressure",mode:"search"});expect(response.status).toBe(200);
    expect(from).not.toHaveBeenCalled();expect(embedSearchQuery).not.toHaveBeenCalled();expect(generateGroundedAnswer).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
    expect((await response.json()).mode).toBe("search");
  });
  it("keeps GET preview searches purely read-only with no AI or rate-ledger calls",async()=>{
    vi.mocked(requireProject).mockResolvedValue({supabase:{rpc},access:{role:"engineer"},preview:{sessionId:"preview"}} as never);
    expect((await get()).status).toBe(200);expect(rateLimited).not.toHaveBeenCalled();expect(embedSearchQuery).not.toHaveBeenCalled();expect(generateGroundedAnswer).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("search_interdisciplinary_evidence",expect.objectContaining({query_embedding:null}));
  });
  it.each(["answer","search"])("denies preview POST %s before any provider or database write",async mode=>{
    vi.mocked(requireProject).mockResolvedValue({supabase:{rpc},access:{role:"engineer"},preview:{sessionId:"preview"}} as never);
    expect((await post({question:"design pressure",mode})).status).toBe(403);
    expect(rateLimited).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();expect(embedSearchQuery).not.toHaveBeenCalled();
  });
  it.each(["organisation_admin","project_admin","viewer"])("preserves %s's existing AI restriction but permits excerpt search",async role=>{
    vi.mocked(requireProject).mockResolvedValue({supabase:{rpc},access:{role},preview:null} as never);
    expect((await post()).status).toBe(403);expect(generateGroundedAnswer).not.toHaveBeenCalled();
    expect((await post({question:"design pressure",mode:"search"})).status).toBe(200);
  });
  it("denies executive access independently of the UI",async()=>{
    vi.mocked(requireProject).mockResolvedValue({supabase:{rpc},access:{role:"executive_viewer"},preview:null} as never);
    expect((await get()).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
  });
  it.each([{question:"a"},{question:"x".repeat(1001)},{question:"design pressure",stage:"SECRET"},{question:"design pressure",discipline:"x".repeat(201)},null])("rejects malformed question/filter input without provider calls",async body=>{
    expect((await post(body)).status).toBe(422);expect(requireProject).not.toHaveBeenCalled();expect(embedSearchQuery).not.toHaveBeenCalled();
  });
  it("rejects an invalid tenant/project before authentication",async()=>{
    expect((await post(undefined,{...params,projectId:"invalid"})).status).toBe(400);expect(requireProject).not.toHaveBeenCalled();
  });
  it("limits paid questions before retrieval/provider work",async()=>{
    vi.mocked(rateLimited).mockResolvedValue(true);const response=await post();expect(response.status).toBe(429);expect(response.headers.get("retry-after")).toBe("60");expect(embedSearchQuery).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  });
  it("avoids provider charges for archived projects while retaining no-AI excerpt access",async()=>{
    projectQuery.maybeSingle.mockResolvedValue({data:{status:"archived"},error:null});
    const response=await post();expect(response.status).toBe(409);expect((await response.json()).error.code).toBe("PROJECT_READ_ONLY");
    expect(embedSearchQuery).not.toHaveBeenCalled();expect(generateGroundedAnswer).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("projects");expect(projectQuery.eq).toHaveBeenCalledWith("organisation_id",params.organisationId);expect(projectQuery.eq).toHaveBeenCalledWith("id",params.projectId);
    expect((await post({question:"design pressure",mode:"search"})).status).toBe(200);
  });
  it("fails closed before provider work if project status cannot be verified",async()=>{
    projectQuery.maybeSingle.mockResolvedValue({data:null,error:{code:"FAILED"}});
    expect((await post()).status).toBe(503);expect(embedSearchQuery).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  });
  it("falls back to lexical retrieval if embedding fails",async()=>{
    vi.mocked(embedSearchQuery).mockRejectedValue(new Error("private embedding service detail"));
    expect((await post()).status).toBe(200);expect(rpc).toHaveBeenCalledWith("search_interdisciplinary_evidence",expect.objectContaining({query_embedding:null}));
  });
  it("returns an honest no-evidence answer without generating or recording fictitious sources",async()=>{
    rpc.mockResolvedValue({data:[],error:null});const response=await post();expect(response.status).toBe(200);expect((await response.json()).grounded).toBe(false);expect(generateGroundedAnswer).not.toHaveBeenCalled();expect(rpc).toHaveBeenCalledTimes(1);
  });
  it.each([{data:null,error:{code:"42501"}},{data:null,error:{code:"READ_FAILED"}}])("fails closed on denied or unavailable evidence",async result=>{
    rpc.mockResolvedValue(result);expect([403,503]).toContain((await post()).status);expect(generateGroundedAnswer).not.toHaveBeenCalled();
  });
  it("contains thrown retrieval failures without leaking internal diagnostics",async()=>{
    rpc.mockRejectedValue(new Error("private service details"));const response=await post();expect(response.status).toBe(503);expect(await response.text()).not.toContain("private service details");
  });
  it.each([{source_ids:[2]},{source_ids:[0]},{source_ids:[1,1]},{source_ids:[1.1]},{source_ids:[]}])("rejects invalid grounded citations $source_ids before recording",async({source_ids})=>{
    vi.mocked(generateGroundedAnswer).mockResolvedValue({...generated,source_ids});expect((await post()).status).toBe(502);expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("rejects citations on an ungrounded response",async()=>{
    vi.mocked(generateGroundedAnswer).mockResolvedValue({...generated,grounded:false});expect((await post()).status).toBe(502);
  });
  it.each([
    {source_ids:[2],answer:"The pressure is 50 barg [2].",expected:"The pressure is 50 barg [1]."},
    {source_ids:[1,3],answer:"Two revisions agree [1, 3].",expected:"Two revisions agree [1] [2]."},
  ])("renumbers a subset of retrieved sources consistently: $source_ids",async({source_ids,answer,expected})=>{
    const sources=[source,{...source,chunk_id:"chunk-2",revision_id:"revision-2"},{...source,chunk_id:"chunk-3",revision_id:"revision-3"}];
    rpc.mockImplementation(async(name:string)=>name==="search_interdisciplinary_evidence"?{data:sources,error:null}:{data:"answer-id",error:null});
    vi.mocked(generateGroundedAnswer).mockResolvedValue({...generated,source_ids,answer});
    const response=await post();expect(response.status).toBe(200);const body=await response.json();expect(body.answer).toBe(expected);
    expect(body.sources.map((item:{label:number})=>item.label)).toEqual(source_ids.map((_,index)=>index+1));
    expect(body.sources.map((item:{revisionId:string})=>item.revisionId)).toEqual(source_ids.map(id=>sources[id-1].revision_id));
    expect(rpc).toHaveBeenCalledWith("record_interdisciplinary_answer",expect.objectContaining({answer:expected,citations:source_ids.map((id,index)=>({chunk_id:sources[id-1].chunk_id,label:index+1,rank:id,score:sources[id-1].score}))}));
  });
  it.each(["No citation provided.","Wrong citation [2]."])("rejects inconsistent inline citation markers: %s",async answer=>{
    vi.mocked(generateGroundedAnswer).mockResolvedValue({...generated,answer});expect((await post()).status).toBe(502);expect(rpc).toHaveBeenCalledTimes(1);
  });
  it("never presents an answer that could not be securely recorded",async()=>{
    rpc.mockImplementation(async(name:string)=>name==="search_interdisciplinary_evidence"?{data:[source],error:null}:{data:null,error:{code:"42501"}});
    const response=await post();expect(response.status).toBe(503);expect((await response.json()).error.code).toBe("ANSWER_RECORD_FAILED");
  });
  it("offers excerpt fallback when the answer service fails",async()=>{
    vi.mocked(generateGroundedAnswer).mockRejectedValue(new Error("private key failure"));const response=await post();expect(response.status).toBe(503);const body=await response.json();expect(body.error.message).toContain("Search excerpts");expect(JSON.stringify(body)).not.toContain("private key failure");
  });
});
