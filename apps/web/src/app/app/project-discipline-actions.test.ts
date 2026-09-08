// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectDiscipline, inspectProjectDisciplineRemoval, removeProjectDiscipline, restoreProjectDiscipline } from "./project-discipline-actions";
import { requireProject } from "@/lib/auth";
import { revalidatePath } from "next/cache";
vi.mock("@/lib/auth", () => ({ requireProject: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const rpc = vi.fn();
const organisationId = "a0000000-0000-4000-8000-000000000001";
const projectId = "a1000000-0000-4000-8000-000000000001";
function access(role = "project_admin") {
  vi.mocked(requireProject).mockResolvedValue({ access: { role }, supabase: { rpc } } as never);
}
function payload(name = "Rotating Equipment", code = "rot") {
  const body = new FormData();
  Object.entries({ organisationId, projectId, name, code }).forEach(([key, value]) => body.set(key, value));
  return body;
}
beforeEach(() => { vi.clearAllMocks(); access(); rpc.mockResolvedValue({ data: "Rotating Equipment", error: null }); });
describe("Project Manager discipline creation", () => {
  it("adds a project-scoped discipline and refreshes team/MDR", async () => {
    expect((await createProjectDiscipline(undefined, payload()))?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("create_project_discipline", { target_organisation: organisationId, target_project: projectId, new_name: "Rotating Equipment", new_code: "ROT" });
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}`,"layout");
  });
  it.each(["document_controller", "engineer", "organisation_admin", "viewer"])("denies %s", async role => {
    access(role);
    expect((await createProjectDiscipline(undefined, payload()))?.ok).not.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("allows an omitted code", async () => {
    await createProjectDiscipline(undefined, payload("X", ""));
    expect(rpc).toHaveBeenCalledWith("create_project_discipline", expect.objectContaining({ new_code: null, new_name: "X" }));
  });
  it.each([["", "ROT"], ["x".repeat(81), "ROT"], ["Rotating", "bad/code"]])("rejects invalid fields", async (name, code) => {
    expect((await createProjectDiscipline(undefined, payload(name, code)))?.ok).not.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("explains duplicate codes", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "23505" } });
    expect((await createProjectDiscipline(undefined, payload()))?.message).toContain("short code is already used");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

const impact={name:"Rotating Equipment",engineerCount:2,documentCount:12,invitationCount:1,plannedPositions:3};
function removal(count=2,ack=true){const form=payload();form.set("confirmed","true");form.set("expectedEngineerCount",String(count));if(ack)form.set("confirmedAssigned","true");return form;}
describe("controlled discipline removal and restoration",()=>{
  it("requires separate permanent acknowledgement and rejects assigned deletion",async()=>{
    const form=removal(0,false);form.set("mode","permanent");
    expect((await removeProjectDiscipline(undefined,form))?.ok).not.toBe(true);
    form.set("confirmedPermanent","true");form.set("expectedEngineerCount","1");
    expect((await removeProjectDiscipline(undefined,form))?.ok).not.toBe(true);expect(rpc).not.toHaveBeenCalled();
  });
  it("uses the server-checked permanent deletion RPC only after confirmation",async()=>{
    const form=removal(0,false);form.set("mode","permanent");form.set("confirmedPermanent","true");
    const result=await removeProjectDiscipline(undefined,form);expect(result?.ok).toBe(true);expect(result?.message).toContain("permanently");
    expect(rpc).toHaveBeenCalledWith("delete_unused_project_discipline",{target_organisation:organisationId,target_project:projectId,target_discipline:"Rotating Equipment",confirmed_permanent:true});
  });
  it("rechecks changed linked work without falling back to archive automatically",async()=>{
    const form=removal(0,false);form.set("mode","permanent");form.set("confirmedPermanent","true");
    rpc.mockResolvedValueOnce({error:{code:"40001"}}).mockResolvedValueOnce({data:{...impact,canDeletePermanently:false},error:null});
    const result=await removeProjectDiscipline(undefined,form);expect(result?.ok).not.toBe(true);expect(result?.impact?.canDeletePermanently).toBe(false);
    expect(result?.message).toContain("Nothing was removed");expect(rpc).toHaveBeenCalledTimes(2);expect(revalidatePath).not.toHaveBeenCalled();
  });
  it.each(["document_controller","engineer","organisation_admin","viewer"])("blocks all management actions for %s",async role=>{
    access(role);
    for(const result of [await inspectProjectDisciplineRemoval(payload()),await removeProjectDiscipline(undefined,removal()),await restoreProjectDiscipline(undefined,payload())])expect(result?.ok).not.toBe(true);
    expect(rpc).not.toHaveBeenCalled();
  });
  it("blocks preview even when preview role is PM",async()=>{
    vi.mocked(requireProject).mockResolvedValue({access:{role:"project_admin"},supabase:{rpc},preview:{}} as never);
    for(const result of [await inspectProjectDisciplineRemoval(payload()),await removeProjectDiscipline(undefined,removal()),await restoreProjectDiscipline(undefined,payload()),await createProjectDiscipline(undefined,payload())])expect(result?.message).toContain("read-only");
    expect(rpc).not.toHaveBeenCalled();
  });
  it("loads authoritative impact scoped to the selected project",async()=>{
    rpc.mockResolvedValue({data:impact,error:null});
    expect((await inspectProjectDisciplineRemoval(payload()))?.impact).toEqual(impact);
    expect(rpc).toHaveBeenCalledWith("get_project_discipline_removal_impact",{target_organisation:organisationId,target_project:projectId,target_discipline:impact.name});
  });
  it("fails closed on malformed warning data",async()=>{
    rpc.mockResolvedValue({data:{...impact,engineerCount:-1},error:null});
    expect((await inspectProjectDisciplineRemoval(payload()))?.impact).toBeUndefined();
  });
  it("requires confirmation and assigned-engineer acknowledgement",async()=>{
    expect((await removeProjectDiscipline(undefined,payload()))?.ok).not.toBe(true);
    expect((await removeProjectDiscipline(undefined,removal(2,false)))?.message).toContain("Acknowledge");
    expect(rpc).not.toHaveBeenCalled();
  });
  it.each([0,2])("submits checked engineer count %s and revalidates all project selectors",async count=>{
    expect((await removeProjectDiscipline(undefined,removal(count,count>0)))?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("remove_project_discipline",{target_organisation:organisationId,target_project:projectId,target_discipline:impact.name,confirmed:true,expected_engineer_count:count,confirmed_assigned:count>0});
    expect(revalidatePath).toHaveBeenCalledWith(`/app/${organisationId}/projects/${projectId}`,"layout");
  });
  it("reloads the warning if engineer assignments changed",async()=>{
    rpc.mockResolvedValueOnce({error:{code:"40001"}}).mockResolvedValueOnce({data:{...impact,engineerCount:3},error:null});
    const result=await removeProjectDiscipline(undefined,removal());
    expect(result?.impact?.engineerCount).toBe(3);expect(result?.message).toContain("changed");expect(result?.ok).not.toBe(true);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("does not expose internal errors",async()=>{
    rpc.mockResolvedValue({error:{code:"XX000",message:"secret internal data"}});
    expect((await removeProjectDiscipline(undefined,removal()))?.message).not.toContain("secret");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
  it("restores a project discipline using the controlled RPC",async()=>{
    expect((await restoreProjectDiscipline(undefined,payload()))?.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("restore_project_discipline",{target_organisation:organisationId,target_project:projectId,target_discipline:impact.name});
  });
});
