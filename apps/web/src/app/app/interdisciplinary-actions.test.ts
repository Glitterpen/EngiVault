// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {recordInterdisciplinaryCheck} from "./interdisciplinary-actions";
import {requireProject} from "@/lib/auth";
import {revalidatePath} from "next/cache";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="b0000000-0000-4000-8000-000000000001",revisionId="c0000000-0000-4000-8000-000000000001";
const rpc=vi.fn();
function access(role="engineer",preview=false){vi.mocked(requireProject).mockResolvedValue({supabase:{rpc},access:{role},preview:preview?{}:null} as never);}
function form(values:Record<string,string>={}){const data=new FormData();for(const [key,value] of Object.entries({organisationId,projectId,revisionId,decision:"signed_off",comment:" Interface checked ",reviewed:"yes",...values}))data.set(key,value);return data;}
beforeEach(()=>{vi.clearAllMocks();access();rpc.mockResolvedValue({data:"check-id",error:null});});
it.each(["engineer","project_admin","document_controller"])("records a separate check for %s",async role=>{
  access(role);const result=await recordInterdisciplinaryCheck({},form());expect(result.ok).toBe(true);expect(result.message).toContain("DCC approval is unchanged");
  expect(rpc).toHaveBeenCalledExactlyOnceWith("submit_interdisciplinary_check",{target_organisation:organisationId,target_project:projectId,target_revision:revisionId,check_decision:"signed_off",check_comment:"Interface checked"});
  expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}/interdisciplinary/${revisionId}`);
});
it.each(["organisation_admin","viewer","executive_viewer"])("rejects sign-off as %s",async role=>{access(role);expect((await recordInterdisciplinaryCheck({},form())).ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();});
it("blocks member preview independently of displayed role",async()=>{access("engineer",true);expect((await recordInterdisciplinaryCheck({},form())).message).toContain("read-only");expect(rpc).not.toHaveBeenCalled();});
it.each<Record<string,string>>([{revisionId:"bad-id"},{decision:"accepted"},{decision:"changes_requested",comment:" "},{comment:"x".repeat(2001)},{reviewed:""}])("rejects invalid or unconfirmed checks before access",async values=>{expect((await recordInterdisciplinaryCheck({},form(values))).ok).not.toBe(true);expect(requireProject).not.toHaveBeenCalled();});
it("requires and submits change feedback",async()=>{await recordInterdisciplinaryCheck({},form({decision:"changes_requested",comment:"Please revise the interface"}));expect(rpc).toHaveBeenCalledWith("submit_interdisciplinary_check",expect.objectContaining({check_decision:"changes_requested",check_comment:"Please revise the interface"}));});
it.each(["42501","22023","54000","XX000"])("does not claim success or expose details for %s",async code=>{rpc.mockResolvedValue({error:{code,message:"private database details"}});const result=await recordInterdisciplinaryCheck({},form());expect(result.ok).not.toBe(true);expect(result.message).not.toContain("private database");expect(revalidatePath).not.toHaveBeenCalled();});
