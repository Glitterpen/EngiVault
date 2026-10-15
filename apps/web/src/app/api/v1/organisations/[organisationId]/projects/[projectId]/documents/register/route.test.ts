// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {GET} from "./route";
import {requireProject} from "@/lib/auth";
import {cleanMdrSearch,loadMdrFolderPage} from "@/lib/mdr-register-data";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/mdr-register-data",()=>({cleanMdrSearch:vi.fn((value:string)=>value.replaceAll(/[,%()]/g,"").trim().slice(0,100)),loadMdrFolderPage:vi.fn()}));

const params={organisationId:"org",projectId:"project"};
const scopedClient={from:vi.fn()};
const folder={documents:[],total:0,page:1,pageSize:25};
function call(query="discipline=Electrical&page=1"){
  return GET(new Request(`https://example.test/api/register?${query}`),{params:Promise.resolve(params)});
}
beforeEach(()=>{
  vi.clearAllMocks();
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role:"document_controller"},preview:null} as never);
  vi.mocked(loadMdrFolderPage).mockResolvedValue(folder);
});

it("returns the complete scoped folder contract with private no-store caching",async()=>{
  const response=await call();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({...folder,canManage:true});
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(requireProject).toHaveBeenCalledExactlyOnceWith("org","project");
  expect(loadMdrFolderPage).toHaveBeenCalledExactlyOnceWith(scopedClient,"org","project","active","","Electrical",1);
});
it("uses only the member-preview proxy and never grants preview management",async()=>{
  const proxy={from:vi.fn()};
  vi.mocked(requireProject).mockResolvedValue({supabase:proxy,access:{role:"document_controller"},preview:{sessionId:"audited-preview"}} as never);
  const response=await call("discipline=Process&records=removed&page=2");
  expect(response.status).toBe(200);expect((await response.json()).canManage).toBe(false);
  expect(loadMdrFolderPage).toHaveBeenCalledExactlyOnceWith(proxy,"org","project","archived","","Process",2);
});
it("allows ordinary viewers to read active folders without management",async()=>{
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role:"viewer"},preview:null} as never);
  const response=await call();expect(response.status).toBe(200);expect((await response.json()).canManage).toBe(false);
});
it.each(["organisation_admin","project_admin","engineer","executive_viewer","unknown"])("rejects %s before any document query",async role=>{
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role},preview:null} as never);
  const response=await call();expect(response.status).toBe(403);
  expect(loadMdrFolderPage).not.toHaveBeenCalled();expect(scopedClient.from).not.toHaveBeenCalled();
});
it("does not expose removed records to a viewer",async()=>{
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role:"viewer"},preview:null} as never);
  expect((await call("discipline=Electrical&records=removed")).status).toBe(403);
  expect(loadMdrFolderPage).not.toHaveBeenCalled();
});
it.each(["","page=1","discipline=","discipline=%20%20","discipline=Electrical&page=0","discipline=Electrical&page=-1","discipline=Electrical&page=1.5","discipline=Electrical&page=abc","discipline=Electrical&page=40001","discipline=Electrical&page=9007199254740993","discipline=Electrical%0Ainvalid"])("validates %s before authentication or database work",async query=>{
  const response=await call(query);expect(response.status).toBe(422);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(requireProject).not.toHaveBeenCalled();expect(loadMdrFolderPage).not.toHaveBeenCalled();
});
it("sanitises the one search term while preserving punctuation in an exact discipline name",async()=>{
  await call("discipline=Civil%20(Onshore)&q=%20(MTO)%25%2C%20&page=3&records=anything-else");
  expect(cleanMdrSearch).toHaveBeenCalledWith(" (MTO)%, ");
  expect(loadMdrFolderPage).toHaveBeenCalledExactlyOnceWith(scopedClient,"org","project","active","MTO","Civil (Onshore)",3);
});
it("does not leak internal database details or claim a partial success",async()=>{
  vi.mocked(loadMdrFolderPage).mockRejectedValue(new Error("private schema and database host details"));
  const response=await call();expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:{message:"This discipline could not be loaded. Retry shortly."}});
  expect(response.headers.get("cache-control")).toBe("private, no-store");
});
it("preserves an authentication redirect instead of turning it into a successful empty folder",async()=>{
  vi.mocked(requireProject).mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(call()).rejects.toThrow("NEXT_REDIRECT");
  expect(loadMdrFolderPage).not.toHaveBeenCalled();
});
