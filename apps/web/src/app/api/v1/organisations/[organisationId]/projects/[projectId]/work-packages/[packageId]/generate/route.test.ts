// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {requireProject} from "@/lib/auth";
import {buildWorkPackage} from "@/lib/processor";
import {POST} from "./route";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/processor",()=>({buildWorkPackage:vi.fn()}));

const rpc=vi.fn();
let role:string,preview:unknown;
const ctx={params:Promise.resolve({organisationId:"org",projectId:"project",packageId:"package"})};
const generate=()=>POST(new Request("https://engicite.test/generate",{method:"POST"}),ctx);

beforeEach(()=>{
  vi.clearAllMocks();role="document_controller";preview=null;
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{rpc},access:{role},preview} as never));
  rpc.mockResolvedValue({error:null});
  vi.mocked(buildWorkPackage).mockResolvedValue(true);
});

it("builds the archive only after the database authorizes the saved selection",async()=>{
  const result=await generate();
  expect(await result.json()).toEqual({state:"ready"});
  expect(rpc).toHaveBeenCalledExactlyOnceWith("request_work_package_generation",{target_package:"package"});
  expect(buildWorkPackage).toHaveBeenCalledExactlyOnceWith("package");
});

it("does not start archive generation when a fresh staging selection is needed",async()=>{
  rpc.mockResolvedValue({error:{code:"55000",message:"work_package_selection_required"}});
  const result=await generate();
  expect(result.status).toBe(409);
  const {error}=await result.json();
  expect(error.code).toBe("PACKAGE_SELECTION_REQUIRED");
  expect(error.message).toContain("Reload the package and save");
  expect(buildWorkPackage).not.toHaveBeenCalled();
});

it("continues to block non-DCC users and read-only audited previews",async()=>{
  role="engineer";expect((await generate()).status).toBe(403);
  role="document_controller";preview={memberId:"dcc-user"};expect((await generate()).status).toBe(423);
  expect(rpc).not.toHaveBeenCalled();expect(buildWorkPackage).not.toHaveBeenCalled();
});

it("does not blame package exceptions for a background build failure",async()=>{
  vi.mocked(buildWorkPackage).mockResolvedValue(false);
  const result=await generate();
  expect(result.status).toBe(503);
  expect((await result.json()).error.message).not.toMatch(/exception/i);
});
