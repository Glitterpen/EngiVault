// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from "vitest";
import {updateRevisionCycle} from "./revision-cycle-actions";
import {requireProject} from "@/lib/auth";
import {revalidatePath} from "next/cache";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const rpc=vi.fn();
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="a1000000-0000-4000-8000-000000000001";
function access(role="project_admin",preview=false){vi.mocked(requireProject).mockResolvedValue({access:{role},supabase:{rpc},preview:preview?{}:null} as never);}
function form(days="3"){const data=new FormData();Object.entries({organisationId,projectId,workingDays:days}).forEach(([k,v])=>data.set(k,v));return data;}
beforeEach(()=>{vi.clearAllMocks();access();rpc.mockResolvedValue({error:null});});
describe("PM revision cycle",()=>{
  it("saves a scoped working-day cycle and refreshes all project pages",async()=>{
    expect((await updateRevisionCycle({},form())).ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("set_project_revision_cycle",{target_organisation:organisationId,target_project:projectId,working_days:3});
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}`,"layout");
  });
  it.each(["document_controller","engineer","organisation_admin","viewer"])("denies %s",async role=>{access(role);expect((await updateRevisionCycle({},form())).ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();});
  it("denies PM member preview",async()=>{access("project_admin",true);expect((await updateRevisionCycle({},form())).message).toContain("read-only");expect(rpc).not.toHaveBeenCalled();});
  it.each(["","0","-1","1.5","366","abc"])("rejects invalid cycle %s",async value=>{expect((await updateRevisionCycle({},form(value))).ok).not.toBe(true);expect(requireProject).not.toHaveBeenCalled();});
  it("does not show success when persistence fails",async()=>{rpc.mockResolvedValue({error:{code:"42501"}});expect((await updateRevisionCycle({},form())).ok).not.toBe(true);expect(revalidatePath).not.toHaveBeenCalled();});
});
