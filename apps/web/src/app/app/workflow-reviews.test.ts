// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {reviewRevision} from "./workflow-actions";
import {requireProject} from "@/lib/auth";
import {revalidatePath} from "next/cache";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn(),requireUser:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
const org="82000000-0000-4000-8000-000000000001",project="83000000-0000-4000-8000-000000000001",revisionId="84000000-0000-4000-8000-000000000001";
const rpc=vi.fn(),eq=vi.fn(),maybeSingle=vi.fn();
let row:Record<string,unknown>|null;
function form(decision="accepted",confirmed=true){const data=new FormData();Object.entries({organisationId:org,projectId:project,revisionId,decision,comment:"Checked"}).forEach(([key,value])=>data.set(key,value));if(confirmed)data.set("conformanceConfirmed","yes");return data;}
beforeEach(()=>{
  vi.clearAllMocks();row={id:revisionId,document_id:"document",state:"ready",control_status:"submitted"};
  const query={select:vi.fn(()=>query),eq,maybeSingle};eq.mockReturnValue(query);maybeSingle.mockImplementation(async()=>({data:row,error:null}));
  rpc.mockResolvedValue({error:null});
  vi.mocked(requireProject).mockResolvedValue({access:{role:"document_controller"},supabase:{from:()=>query,rpc},preview:null} as never);
});
it("requires conformance before approval, even for a forged form",async()=>{
  expect((await reviewRevision(undefined,form("accepted",false)))?.message).toContain("tick the conformance");
  expect(requireProject).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
});
it("allows returning a ready submission without accepting conformance",async()=>{
  expect((await reviewRevision(undefined,form("returned",false)))?.ok).toBe(true);
  expect(rpc).toHaveBeenCalledWith("review_document_revision",{target_revision:revisionId,decision:"returned",comment:"Checked"});
});
it.each(["quarantined","processing","failed","pending_upload"])("never reviews an unsafe %s revision",async(state)=>{
  row!.state=state;expect((await reviewRevision(undefined,form()))?.ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();
});
it.each(["engineer","project_admin","organisation_admin"])("blocks %s from reviewing",async(role)=>{
  vi.mocked(requireProject).mockResolvedValue({access:{role},supabase:{rpc}} as never);
  expect((await reviewRevision(undefined,form()))?.ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();
});
it("blocks changes while previewing the DCC",async()=>{
  vi.mocked(requireProject).mockResolvedValue({access:{role:"document_controller"},preview:{memberId:"dcc"},supabase:{rpc}} as never);
  expect((await reviewRevision(undefined,form()))?.message).toContain("read-only");expect(rpc).not.toHaveBeenCalled();
});
it("verifies the organisation/project and rejects out-of-scope revision IDs",async()=>{
  row=null;expect((await reviewRevision(undefined,form()))?.ok).not.toBe(true);
  expect(eq).toHaveBeenCalledWith("organisation_id",org);expect(eq).toHaveBeenCalledWith("project_id",project);expect(eq).toHaveBeenCalledWith("id",revisionId);expect(rpc).not.toHaveBeenCalled();
});
it("does not silently swallow a database failure or expose its internal message",async()=>{
  rpc.mockResolvedValue({error:{code:"42501",message:"postgres private details"}});
  const result=await reviewRevision(undefined,form());expect(result?.message).toContain("could not be saved");expect(result?.message).not.toContain("postgres");expect(result?.ok).not.toBe(true);expect(revalidatePath).not.toHaveBeenCalled();
});
it("handles a concurrent review without claiming success",async()=>{
  rpc.mockResolvedValue({error:{code:"55000"}});expect((await reviewRevision(undefined,form()))?.message).toContain("status changed");
});
it("rejects already reviewed submissions",async()=>{
  row!.control_status="accepted";expect((await reviewRevision(undefined,form()))?.message).toContain("already been reviewed");expect(rpc).not.toHaveBeenCalled();
});
it("refreshes review, document and engineer views after approval",async()=>{
  expect((await reviewRevision(undefined,form()))?.ok).toBe(true);
  for(const suffix of ["reviews","documents/document","assignments","control"])expect(revalidatePath).toHaveBeenCalledWith(`/app/${org}/projects/${project}/${suffix}`);
});
