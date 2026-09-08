// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {GET,POST} from "./route";
import {requireProject} from "@/lib/auth";
import {after} from "next/server";
import {processNextDocumentRevision} from "@/lib/processor";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/server",()=>({after:vi.fn()}));
vi.mock("@/lib/processor",()=>({processNextDocumentRevision:vi.fn()}));
const rpc=vi.fn(),eq=vi.fn();
let role:string,preview:unknown,revision:unknown,runError:unknown;
const ctx={params:Promise.resolve({organisationId:"org",projectId:"project",documentId:"document",revisionId:"revision"})};
const request=new Request("https://example.test/processing");
beforeEach(()=>{
  vi.clearAllMocks();role="document_controller";preview=null;revision={id:"revision",state:"failed"};runError=null;rpc.mockResolvedValue({data:"run",error:null});
  vi.mocked(processNextDocumentRevision).mockResolvedValue("processed");
  const from=(table:string)=>{
    const query={select:()=>query,eq:(...args:unknown[])=>{eq(...args);return query},order:()=>query,limit:()=>query,maybeSingle:async()=>table==="document_revisions"?{data:revision,error:null}:{data:{state:"failed"},error:runError}};return query;
  };
  vi.mocked(requireProject).mockImplementation(async()=>({access:{role},preview,supabase:{rpc,from}} as never));
});
it("wakes processing only after an authorized retry is queued",async()=>{
  expect((await POST(request,ctx)).status).toBe(202);expect(rpc).toHaveBeenCalledWith("retry_revision_processing",{target_revision:"revision"});expect(after).toHaveBeenCalledTimes(1);
  const callback=vi.mocked(after).mock.calls[0][0] as ()=>Promise<void>;await callback();expect(processNextDocumentRevision).toHaveBeenCalledOnce();
});
it.each(["engineer","project_admin","organisation_admin"])("rejects retry from %s",async(value)=>{
  role=value;expect((await POST(request,ctx)).status).toBe(403);expect(rpc).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();
});
it("rejects retry in audited preview",async()=>{
  preview={memberId:"dcc"};expect((await POST(request,ctx)).status).toBe(403);expect(rpc).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();
});
it("never wakes the worker after a denied retry",async()=>{
  rpc.mockResolvedValue({error:{code:"42501"}});expect((await POST(request,ctx)).status).toBe(409);expect(after).not.toHaveBeenCalled();
});
it("rejects a missing or out-of-scope revision",async()=>{
  revision=null;expect((await POST(request,ctx)).status).toBe(404);expect(rpc).not.toHaveBeenCalled();
  for(const [key,value] of Object.entries({organisation_id:"org",project_id:"project",document_id:"document",id:"revision"}))expect(eq).toHaveBeenCalledWith(key,value);
});
it("keeps status reads side-effect free",async()=>{
  const result=await GET(request,ctx);expect(result.status).toBe(200);expect(result.headers.get("Cache-Control")).toBe("no-store");expect(rpc).not.toHaveBeenCalled();expect(after).not.toHaveBeenCalled();
});
it("reports status lookup failures",async()=>{
  runError={code:"FAILED"};expect((await GET(request,ctx)).status).toBe(503);
});
