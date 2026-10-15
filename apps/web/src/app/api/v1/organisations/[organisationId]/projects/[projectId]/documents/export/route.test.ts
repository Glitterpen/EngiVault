// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {GET} from "./route";
import {requireProject} from "@/lib/auth";
import * as permissions from "@/lib/permissions";
import {createMdrRegisterCsv,loadMdrRegisterExport} from "@/lib/mdr-register-export";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/mdr-register-export",()=>({loadMdrRegisterExport:vi.fn(),createMdrRegisterCsv:vi.fn()}));

const params={organisationId:"org",projectId:"project"};
const scopedClient={from:vi.fn(),rpc:vi.fn(),storage:{from:vi.fn()}};
function call(query="",values=params){return GET(new Request(`https://example.test/api/export?${query}`),{params:Promise.resolve(values)});}
beforeEach(()=>{
  vi.restoreAllMocks();vi.clearAllMocks();
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role:"document_controller"},preview:null} as never);
  vi.mocked(loadMdrRegisterExport).mockResolvedValue([]);
  vi.mocked(createMdrRegisterCsv).mockReturnValue('\uFEFF"Document number"\r\n');
});

it("downloads an attachment with private no-store, nosniff and Excel UTF-8 content",async()=>{
  const response=await call();
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toBe("text/csv; charset=utf-8");
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="EngiCite-MDR-project.csv"');
  expect(response.headers.get("cache-control")).toBe("private, no-store");expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(Array.from(new Uint8Array(await response.arrayBuffer()).slice(0,3))).toEqual([239,187,191]);
  expect(requireProject).toHaveBeenCalledExactlyOnceWith("org","project");
  expect(loadMdrRegisterExport).toHaveBeenCalledExactlyOnceWith(scopedClient,"org","project","active");
  expect(createMdrRegisterCsv).toHaveBeenCalledExactlyOnceWith([]);
  expect(scopedClient.rpc).not.toHaveBeenCalled();expect(scopedClient.storage.from).not.toHaveBeenCalled();
});
it("always exports the full register, ignoring current search, discipline and page",async()=>{
  await call("q=pump&discipline=Electrical&page=7&records=anything-else");
  expect(loadMdrRegisterExport).toHaveBeenCalledExactlyOnceWith(scopedClient,"org","project","active");
});
it("allows a read-only audited DCC preview download using only its member-scoped proxy",async()=>{
  const proxy={from:vi.fn(),rpc:vi.fn()};
  vi.mocked(requireProject).mockResolvedValue({supabase:proxy,access:{role:"document_controller"},preview:{sessionId:"audited-preview"}} as never);
  const response=await call("records=removed");expect(response.status).toBe(200);
  expect(response.headers.get("content-disposition")).toBe('attachment; filename="EngiCite-MDR-project-removed.csv"');
  expect(loadMdrRegisterExport).toHaveBeenCalledExactlyOnceWith(proxy,"org","project","archived");
  expect(proxy.rpc).not.toHaveBeenCalled();expect(scopedClient.from).not.toHaveBeenCalled();
});
it("allows a viewer to download the active register",async()=>{
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role:"viewer"},preview:null} as never);
  expect((await call()).status).toBe(200);
});
it.each(["organisation_admin","project_admin","engineer","executive_viewer","unknown"])("rejects %s without reading documents",async role=>{
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role},preview:null} as never);
  expect((await call()).status).toBe(403);expect(loadMdrRegisterExport).not.toHaveBeenCalled();expect(createMdrRegisterCsv).not.toHaveBeenCalled();
});
it("does not allow an ordinary viewer to export removed records",async()=>{
  vi.mocked(requireProject).mockResolvedValue({supabase:scopedClient,access:{role:"viewer"},preview:null} as never);
  expect((await call("records=removed")).status).toBe(403);expect(loadMdrRegisterExport).not.toHaveBeenCalled();
});
it.each(["document:read","document:download"] as const)("requires %s independently",async denied=>{
  vi.spyOn(permissions,"can").mockImplementation((_role,capability)=>capability!==denied);
  expect((await call()).status).toBe(403);expect(loadMdrRegisterExport).not.toHaveBeenCalled();
});
it("sanitizes response filename identifiers without weakening exact tenant scope",async()=>{
  const ids={organisationId:"org-B",projectId:'project-B\r\n"; evil=x'};
  const response=await call("",ids);
  expect(response.status).toBe(200);expect(response.headers.get("content-disposition")).toBe('attachment; filename="EngiCite-MDR-project-Bevilx.csv"');
  expect(requireProject).toHaveBeenCalledExactlyOnceWith(ids.organisationId,ids.projectId);
  expect(loadMdrRegisterExport).toHaveBeenCalledExactlyOnceWith(scopedClient,ids.organisationId,ids.projectId,"active");
});
it("returns a generic failure instead of a partial file or backend/provider detail",async()=>{
  vi.mocked(loadMdrRegisterExport).mockRejectedValue(new Error("private provider credentials and SQL details"));
  const response=await call();expect(response.status).toBe(503);
  expect(await response.json()).toEqual({error:{message:"The MDR download could not be prepared. Retry shortly."}});
  expect(response.headers.get("content-disposition")).toBeNull();expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");expect(createMdrRegisterCsv).not.toHaveBeenCalled();
});
it("preserves authentication redirects instead of swallowing them as a download",async()=>{
  vi.mocked(requireProject).mockRejectedValue(new Error("NEXT_REDIRECT"));
  await expect(call()).rejects.toThrow("NEXT_REDIRECT");expect(loadMdrRegisterExport).not.toHaveBeenCalled();
});
