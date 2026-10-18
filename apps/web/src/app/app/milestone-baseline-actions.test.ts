// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {approveMilestoneBaseline} from "./milestone-baseline-actions";
import {requireProject} from "@/lib/auth";
import {revalidatePath} from "next/cache";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const rpc=vi.fn();
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="a1000000-0000-4000-8000-000000000001",documentId="a2000000-0000-4000-8000-000000000001";
const milestones=[{document_id:documentId,milestones:[{issue_status:"IFR",planned_date:"2026-10-01"},{issue_status:"IFA",planned_date:"2026-10-10"},{issue_status:"IFD",planned_date:"2026-10-20"}]}];
function access(role="project_admin",preview=false){vi.mocked(requireProject).mockResolvedValue({access:{role},supabase:{rpc},preview:preview?{}:null} as never);}
function form(){const data=new FormData();Object.entries({organisationId,projectId,expectedBaseline:"",expectedScopeHash:"scope-hash",approvalReason:"Initial agreed project baseline",confirmApproval:"on",plannedMilestones:JSON.stringify(milestones)}).forEach(([key,value])=>data.set(key,value));return data;}
beforeEach(()=>{vi.clearAllMocks();access();rpc.mockResolvedValue({data:{},error:null});});
describe("PM baseline approval action",()=>{
  it("approves exactly the supplied dates against the expected frozen scope and current version",async()=>{
    const result=await approveMilestoneBaseline({},form());expect(result.ok).toBe(true);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("approve_project_milestone_baseline",{target_organisation:organisationId,target_project:projectId,expected_baseline:null,expected_scope_hash:"scope-hash",planned_milestones:milestones,approval_reason:"Initial agreed project baseline"});
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}`,"layout");
    expect(result.message).toContain("actual progress are unchanged");
  });
  it.each(["engineer","document_controller","organisation_admin","viewer"])("rejects %s without any mutation",async role=>{access(role);expect((await approveMilestoneBaseline({},form())).ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();});
  it("rejects an audited PM preview before calling any mutation",async()=>{access("project_admin",true);expect((await approveMilestoneBaseline({},form())).message).toContain("read-only");expect(rpc).not.toHaveBeenCalled();});
  it.each(["confirmApproval","approvalReason","expectedScopeHash","organisationId","projectId"])("requires %s",async key=>{const data=form();data.delete(key);expect((await approveMilestoneBaseline({},data)).ok).not.toBe(true);expect(requireProject).not.toHaveBeenCalled();});
  it.each(["not-json","[]",JSON.stringify([...milestones,...milestones]),JSON.stringify([{...milestones[0],progress_weight:100}])])("rejects malformed or scope-changing plan %#",async value=>{const data=form();data.set("plannedMilestones",value);expect((await approveMilestoneBaseline({},data)).ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();});
  it.each(["40001","23505"])("requires fresh review after concurrent changes (%s)",async code=>{rpc.mockResolvedValue({error:{code}});const result=await approveMilestoneBaseline({},form());expect(result.ok).not.toBe(true);expect(result.message).toContain("changed");expect(revalidatePath).not.toHaveBeenCalled();});
  it.each(["22023","23514"])("asks for complete dates after validation rejection (%s)",async code=>{rpc.mockResolvedValue({error:{code}});expect((await approveMilestoneBaseline({},form())).message).toContain("incomplete");});
  it("explains scope capacity without claiming partial approval",async()=>{rpc.mockResolvedValue({error:{code:"54000"}});expect((await approveMilestoneBaseline({},form())).message).toContain("No partial plan was approved");});
  it("does not expose infrastructure errors or claim success on failure",async()=>{rpc.mockResolvedValue({error:{code:"42501",message:"supabase secret internals"}});const result=await approveMilestoneBaseline({},form());expect(result.ok).not.toBe(true);expect(result.message).toContain("Reference: EC-");expect(result.message).not.toContain("supabase");expect(revalidatePath).not.toHaveBeenCalled();});
  it("handles an uncertain transport outcome without prompting blind duplicate approval",async()=>{rpc.mockRejectedValue(new Error("network"));expect((await approveMilestoneBaseline({},form())).message).toContain("Reload the plan before trying again");expect(revalidatePath).not.toHaveBeenCalled();});
});
