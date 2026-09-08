// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {assignDisciplineDocuments,setDocumentAssignment} from "./workflow-actions";
import {requireProject} from "@/lib/auth";
import {revalidatePath} from "next/cache";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn(),requireUser:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
const org="82000000-0000-4000-8000-000000000001",project="83000000-0000-4000-8000-000000000001",userId="81000000-0000-4000-8000-000000000004",documentId="84000000-0000-4000-8000-000000000001";
const rpc=vi.fn();
function form(){const data=new FormData();Object.entries({organisationId:org,projectId:project,userId,documentId,discipline:"Electrical",enabled:"false"}).forEach(([key,value])=>data.set(key,value));return data;}
beforeEach(()=>{vi.clearAllMocks();vi.mocked(requireProject).mockResolvedValue({access:{role:"document_controller"},supabase:{rpc}} as never);rpc.mockResolvedValue({data:{discipline:"Electrical",total_documents:10,new_assignments:2},error:null});});
it("keeps bulk mutation project-scoped and refreshes the outstanding allocation list",async()=>{
  expect((await assignDisciplineDocuments(undefined,form()))?.message).toContain("2 new Electrical");
  expect(rpc).toHaveBeenCalledWith("assign_discipline_documents",{target_organisation:org,target_project:project,target_discipline:"Electrical",target_user:userId});
  expect(revalidatePath).toHaveBeenCalledWith(`/app/${org}/projects/${project}/documents`);
});
it("refreshes the MDR allocation list after an individual assignment is removed",async()=>{
  expect((await setDocumentAssignment(undefined,form()))?.ok).toBe(true);
  expect(revalidatePath).toHaveBeenCalledWith(`/app/${org}/projects/${project}/documents`);
});
it("does not remove pending choices when the database rejects assignment",async()=>{
  rpc.mockResolvedValue({error:{code:"22023"}});
  expect((await assignDisciplineDocuments(undefined,form()))?.ok).not.toBe(true);
  expect(revalidatePath).not.toHaveBeenCalled();
});
it("still blocks project managers from assigning MDR deliverables",async()=>{
  vi.mocked(requireProject).mockResolvedValue({access:{role:"project_admin"},supabase:{rpc}} as never);
  expect((await assignDisciplineDocuments(undefined,form()))?.ok).not.toBe(true);
  expect(rpc).not.toHaveBeenCalled();
});
it("handles a stale duplicate request without claiming new work or email",async()=>{
  rpc.mockResolvedValue({data:{discipline:"Electrical",total_documents:10,new_assignments:0},error:null});
  expect((await assignDisciplineDocuments(undefined,form()))?.message).toContain("No duplicate notification");
});
