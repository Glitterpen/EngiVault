// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {POST} from "./route";
import {requireProject} from "@/lib/auth";
import {processNextDocumentRevision} from "@/lib/processor";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/processor",()=>({processNextDocumentRevision:vi.fn()}));

const context={params:Promise.resolve({organisationId:"org",projectId:"project"})};
const request=()=>new Request("https://engicite.test/api/v1/organisations/org/projects/project/work-packages/transmittals/process",{method:"POST"});
let role:string,preview:unknown;

beforeEach(()=>{
  vi.clearAllMocks();
  role="document_controller";
  preview=null;
  vi.mocked(requireProject).mockImplementation(async()=>({access:{role},preview} as never));
  vi.mocked(processNextDocumentRevision).mockResolvedValue("processed");
});

it("prepares files for an authenticated normal DCC without changing the response contract",async()=>{
  const result=await POST(request(),context);
  expect(requireProject).toHaveBeenCalledWith("org","project");
  expect(result.status).toBe(200);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(await result.json()).toEqual({state:"processed"});
  expect(processNextDocumentRevision).toHaveBeenCalledExactlyOnceWith();
});

it("rejects an audited DCC preview before the worker even when middleware is bypassed",async()=>{
  preview={sessionId:"audited-session",role:"document_controller"};
  const result=await POST(request(),context);
  expect(result.status).toBe(423);
  expect(result.headers.get("Cache-Control")).toBe("no-store");
  expect(await result.json()).toEqual({error:{code:"ADMIN_PREVIEW_READ_ONLY",message:"Exit administrator role preview before changing project data."}});
  expect(processNextDocumentRevision).not.toHaveBeenCalled();
});

it.each(["engineer","project_admin","organisation_admin","viewer","executive_viewer"])("keeps preparation forbidden for %s",async(value)=>{
  role=value;
  const result=await POST(request(),context);
  expect(result.status).toBe(403);
  expect((await result.json()).error.code).toBe("FORBIDDEN");
  expect(processNextDocumentRevision).not.toHaveBeenCalled();
});

it("does not call the worker when authentication or project verification fails",async()=>{
  vi.mocked(requireProject).mockRejectedValue(new Error("authentication unavailable"));
  await expect(POST(request(),context)).rejects.toThrow("authentication unavailable");
  expect(processNextDocumentRevision).not.toHaveBeenCalled();
});

it("preserves the safe unavailable response without exposing processing diagnostics",async()=>{
  vi.mocked(processNextDocumentRevision).mockRejectedValue(new Error("private service token detail"));
  const result=await POST(request(),context);
  expect(result.status).toBe(503);
  expect(await result.json()).toEqual({error:{code:"PROCESSOR_UNAVAILABLE",message:"Secure document preparation is temporarily unavailable."}});
});
