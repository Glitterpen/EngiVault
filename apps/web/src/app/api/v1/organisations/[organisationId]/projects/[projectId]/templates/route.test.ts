import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {GET,POST} from "./route";
import {POST as complete} from "./complete/route";
import {GET as download} from "./download/route";
const mocks=vi.hoisted(()=>({require:vi.fn(),rpc:vi.fn(),admin:vi.fn(),signUpload:vi.fn(),signDownload:vi.fn(),limit:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:mocks.require}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:mocks.admin}));
vi.mock("@/lib/rate-limit",()=>({rateLimited:mocks.limit}));
vi.mock("@/lib/processor",()=>({resolveProcessorConfig:()=>({base:"https://processor.example.test",secret:"private-service-credential"})}));
const org="fb000000-0000-4000-8000-000000000101",project="fb000000-0000-4000-8000-000000000201",id="fb000000-0000-4000-8000-000000000301";
const ctx={params:Promise.resolve({organisationId:org,projectId:project})};
const body=(value:unknown)=>new Request("https://app.example.test/templates",{method:"POST",body:JSON.stringify(value)});
const read=()=>new Request("https://app.example.test/templates");
beforeEach(()=>{
  vi.clearAllMocks();mocks.limit.mockResolvedValue(false);
  mocks.require.mockResolvedValue({supabase:{rpc:mocks.rpc},access:{role:"project_admin"},preview:null});
  mocks.admin.mockReturnValue({storage:{from:()=>({createSignedUploadUrl:mocks.signUpload,createSignedUrl:mocks.signDownload})}});
  vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>({state:"ready"})}));
});
afterEach(()=>vi.unstubAllGlobals());
describe("project template routes",()=>{
  it("never signs an upload for engineers or read-only preview",async()=>{
    for(const access of [{role:"engineer",preview:null},{role:"project_admin",preview:{sessionId:"preview"}}]){
      mocks.require.mockResolvedValue({supabase:{rpc:mocks.rpc},access:{role:access.role},preview:access.preview});
      expect((await POST(body({}),ctx)).status).toBe(403);
      expect((await complete(body({id}),ctx)).status).toBe(403);
    }
    expect(mocks.admin).not.toHaveBeenCalled();expect(fetch).not.toHaveBeenCalled();
  });
  it("signs only the database-derived upload key",async()=>{
    mocks.rpc.mockResolvedValue({data:{id,storageKey:"server/scoped/upload.zip"},error:null});
    mocks.signUpload.mockResolvedValue({data:{path:"server/scoped/upload.zip",token:"upload-token"},error:null});
    const response=await POST(body({filename:"Templates.zip",size:100,sha256:"a".repeat(64),storageKey:"evil/overwrite"}),ctx);
    expect(response.status).toBe(200);
    expect(mocks.signUpload).toHaveBeenCalledWith("server/scoped/upload.zip",{upsert:false});
    expect(mocks.rpc).toHaveBeenCalledWith("begin_project_template_upload",expect.objectContaining({target_project:project,target_organisation:org}));
  });
  it("rejects oversized or non-ZIP uploads",async()=>{
    for(const payload of [{filename:"file.exe",size:100},{filename:"file.zip",size:52428801}]){
      expect((await POST(body({...payload,sha256:"a".repeat(64)}),ctx)).status).toBe(422);
    }
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it("cannot scan another upload or a cancelled upload",async()=>{
    mocks.rpc.mockResolvedValue({data:{current:null,pending:{id:"other"}},error:null});
    expect((await complete(body({id}),ctx)).status).toBe(409);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("publishes only the caller's verified pending pack",async()=>{
    mocks.rpc.mockResolvedValue({data:{current:null,pending:{id}},error:null});
    expect((await complete(body({id}),ctx)).status).toBe(200);
    expect(fetch).toHaveBeenCalledWith("https://processor.example.test/internal/v1/publish-template-pack",expect.objectContaining({body:JSON.stringify({pack_id:id})}));
  });
  it("reports scan failure without publishing from the web server",async()=>{
    mocks.rpc.mockResolvedValue({data:{current:{id:"old"},pending:{id}},error:null});
    vi.mocked(fetch).mockResolvedValue({ok:false,status:422,json:async()=>({detail:"Unsafe ZIP"})} as Response);
    const response=await complete(body({id}),ctx);
    expect(response.status).toBe(422);expect((await response.json()).error.message).toBe("Unsafe ZIP");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("forwards missing-upload instructions instead of asking the manager to retry a scan",async()=>{
    const detail="The ZIP upload did not complete. Select the ZIP and upload it again before retrying security checks.";
    mocks.rpc.mockResolvedValue({data:{current:{id:"old"},pending:{id}},error:null});
    vi.mocked(fetch).mockResolvedValue({ok:false,status:422,json:async()=>({detail})} as Response);
    const response=await complete(body({id}),ctx);
    expect(response.status).toBe(422);
    expect((await response.json()).error.message).toBe(detail);
    expect(mocks.admin).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it("keeps transient service failures retryable and does not expose backend details",async()=>{
    mocks.rpc.mockResolvedValue({data:{current:{id:"old"},pending:{id}},error:null});
    vi.mocked(fetch).mockResolvedValue({ok:false,status:503,json:async()=>({detail:"Private storage/scanner failure"})} as Response);
    const response=await complete(body({id}),ctx);
    expect(response.status).toBe(503);
    const message=(await response.json()).error.message;
    expect(message).toContain("Retry shortly.");
    expect(message).not.toContain("Private storage/scanner failure");
    expect(mocks.admin).not.toHaveBeenCalled();
  });
  it("requires download authorization before using privileged storage",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"42501"}});
    expect((await download(read(),ctx)).status).toBe(403);
    expect(mocks.admin).not.toHaveBeenCalled();
    mocks.rpc.mockResolvedValue({data:{storageKey:"scanned/published.zip",filename:"Templates.zip"},error:null});
    mocks.signDownload.mockResolvedValue({data:{signedUrl:"https://storage.example.test/scoped-download"},error:null});
    const response=await download(read(),ctx);
    expect(response.status).toBe(302);expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mocks.signDownload).toHaveBeenCalledWith("scanned/published.zip",60,{download:"Templates.zip"});
  });
  it("metadata failures do not look like an empty project",async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{code:"PGRST"}});
    expect((await GET(read(),ctx)).status).toBe(503);
  });
});
