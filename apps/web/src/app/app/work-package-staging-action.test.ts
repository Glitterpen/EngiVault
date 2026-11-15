// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {requireProject} from "@/lib/auth";
import {restageWorkPackage,saveWorkPackageStaging} from "./work-package-staging-action";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn((path:string)=>{throw new Error(`redirect:${path}`);})}));

const organisationId="20000000-0000-4000-8000-000000000001";
const projectId="20000000-0000-4000-8000-000000000002";
const packageId="20000000-0000-4000-8000-000000000003";
const updatedAt="2026-11-15T10:04:07.123456+00:00";
const included={item_id:"20000000-0000-4000-8000-000000000004",revision_id:"20000000-0000-4000-8000-000000000005"};
const excluded={item_id:"20000000-0000-4000-8000-000000000006",revision_id:null};
const base=`/app/${organisationId}/projects/${projectId}/work-packages`;
const rpc=vi.fn();
let role:string,preview:unknown;

function form(selection:unknown=[included,excluded]){
  const data=new FormData();
  for(const [key,value] of Object.entries({organisationId,projectId,packageId,updatedAt,selection:JSON.stringify(selection)}))data.set(key,value);
  return data;
}

beforeEach(()=>{
  vi.clearAllMocks();role="document_controller";preview=null;
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{rpc},access:{role},preview} as never));
  rpc.mockResolvedValue({data:null,error:null});
});

it("saves exact revision IDs and explicit null exclusions with the scoped package version",async()=>{
  await expect(saveWorkPackageStaging(undefined,form())).rejects.toThrow(`redirect:${base}/${packageId}`);
  expect(requireProject).toHaveBeenCalledExactlyOnceWith(organisationId,projectId);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("save_work_package_staging",{target_organisation:organisationId,target_project:projectId,target_package:packageId,expected_updated_at:updatedAt,selection:[included,excluded]});
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([[base],[`${base}/${packageId}`]]);
  expect(redirect).toHaveBeenCalledExactlyOnceWith(`${base}/${packageId}`);
});

it.each(["engineer","organisation_admin","project_admin","viewer","executive_viewer"])("denies a direct save by %s",async value=>{
  role=value;
  expect((await saveWorkPackageStaging(undefined,form()))?.message).toContain("Document Controller");
  expect(rpc).not.toHaveBeenCalled();
});

it("denies saving while previewing a Document Controller",async()=>{
  preview={memberId:"dcc-user"};
  expect((await saveWorkPackageStaging(undefined,form()))?.message).toContain("outside of preview");
  expect(rpc).not.toHaveBeenCalled();
});

it.each([[{item_id:included.item_id}], [included,included], [excluded], [], [{...included,other_field:"unexpected"}]].map(input=>({input}))) ("rejects invalid selection $input without a write",async({input})=>{
  expect((await saveWorkPackageStaging(undefined,form(input)))?.message).toBeTruthy();
  expect(rpc).not.toHaveBeenCalled();
});

it("rejects unreadable payloads and missing timestamps",async()=>{
  const invalid=form();invalid.set("selection","{");
  expect((await saveWorkPackageStaging(undefined,invalid))?.message).toContain("could not be read");
  invalid.delete("updatedAt");
  expect((await saveWorkPackageStaging(undefined,invalid))?.message).toContain("could not be read");
  expect(rpc).not.toHaveBeenCalled();
});

it("returns an actionable stale selection message with no redirect or backend details",async()=>{
  rpc.mockResolvedValue({data:null,error:{code:"55000",message:"private database diagnostics"}});
  const result=await saveWorkPackageStaging(undefined,form());
  expect(result?.message).toContain("Reload the package and review");
  expect(result?.message).not.toContain("private database");
  expect(revalidatePath).not.toHaveBeenCalled();
  expect(redirect).not.toHaveBeenCalled();
});

it("opens a separate package version without modifying the current ZIP",async()=>{
  const newVersionId="20000000-0000-4000-8000-000000000007";
  rpc.mockResolvedValue({data:newVersionId,error:null});
  await expect(restageWorkPackage(undefined,form())).rejects.toThrow(`redirect:${base}/${newVersionId}`);
  expect(rpc).toHaveBeenCalledExactlyOnceWith("restage_work_package",{target_organisation:organisationId,target_project:projectId,target_package:packageId});
  expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(base);
});

it("directs the DCC to the latest version if the source is stale",async()=>{
  rpc.mockResolvedValue({error:{code:"55000",message:"work_package_restage_stale"}});
  expect((await restageWorkPackage(undefined,form()))?.message).toContain("Open the latest version");
  expect(redirect).not.toHaveBeenCalled();
});

it("does not stage versions from non-DCC accounts or audited previews",async()=>{
  role="viewer";
  expect((await restageWorkPackage(undefined,form()))?.message).toContain("Document Controller");
  role="document_controller";preview={memberId:"dcc-user"};
  expect((await restageWorkPackage(undefined,form()))?.message).toContain("outside of preview");
  expect(rpc).not.toHaveBeenCalled();
});
