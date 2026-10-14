// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {POST} from "./route";
import {requireProject} from "@/lib/auth";
import {rateLimited} from "@/lib/rate-limit";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/rate-limit",()=>({rateLimited:vi.fn()}));
const rpc=vi.fn(),sign=vi.fn();
const params={organisationId:"org",projectId:"project",documentId:"document",revisionId:"revision"};
beforeEach(()=>{
  vi.clearAllMocks();vi.mocked(rateLimited).mockResolvedValue(false);
  vi.mocked(requireProject).mockResolvedValue({access:{role:"engineer"},preview:null,supabase:{rpc,storage:{from:()=>({createSignedUploadUrl:sign})}}} as never);
  rpc.mockResolvedValue({data:{files:[]},error:null});sign.mockResolvedValue({data:{token:"test-token"},error:null});
});
const call=(action="resume")=>POST(new Request("https://example.test/recovery",{method:"POST",body:JSON.stringify({action})}),{params:Promise.resolve(params)});
it("blocks read-only previews before issuing any recovery authorisation",async()=>{
  vi.mocked(requireProject).mockResolvedValue({access:{role:"engineer"},preview:{id:"preview"}} as never);
  expect((await call()).status).toBe(403);expect(rpc).not.toHaveBeenCalled();
});
it("blocks DCC recovery",async()=>{
  vi.mocked(requireProject).mockResolvedValue({access:{role:"document_controller"}} as never);
  expect((await call()).status).toBe(403);
});
it("signs only the missing file and never enables overwrite",async()=>{
  rpc.mockResolvedValue({data:{files:[{kind:"native",path:"native-path",name:"source.dwg",size:42,sha256:"hash",mime:"image/vnd.dwg"}]}});
  const response=await call();expect(response.status).toBe(200);
  expect(sign).toHaveBeenCalledExactlyOnceWith("native-path",{upsert:false});
  expect(rpc).toHaveBeenCalledWith("recover_incomplete_revision_upload",{target_organisation:"org",target_project:"project",target_document:"document",target_revision:"revision",cancel_upload:false});
  expect((await response.json()).files).toHaveLength(1);
});
it("cancels without issuing upload links",async()=>{rpc.mockResolvedValue({data:{cancelled:true}});expect((await call("cancel")).status).toBe(200);expect(sign).not.toHaveBeenCalled();});
it("does not claim success for an absent recovery result",async()=>{rpc.mockResolvedValue({data:null});expect((await call()).status).toBe(503);expect((await call("cancel")).status).toBe(503);});
it("fails closed when the database rejects a completed revision",async()=>{
  rpc.mockResolvedValue({error:{code:"55000"}});expect((await call()).status).toBe(409);expect(sign).not.toHaveBeenCalled();
});
it("reports signing failure without claiming success",async()=>{
  rpc.mockResolvedValue({data:{files:[{path:"missing"}]}});sign.mockResolvedValue({error:{name:"failure"}});
  expect((await call()).status).toBe(503);
});
it("rejects invalid actions",async()=>{expect((await call("reset-all")).status).toBe(422);expect(rpc).not.toHaveBeenCalled();});
it("rate limits recovery",async()=>{vi.mocked(rateLimited).mockResolvedValue(true);expect((await call()).status).toBe(429);expect(rpc).not.toHaveBeenCalled();});
