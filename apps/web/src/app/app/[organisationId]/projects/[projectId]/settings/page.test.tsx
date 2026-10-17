import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import ProjectSettings from "./page";

const mocks=vi.hoisted(()=>({requireProject:vi.fn(),from:vi.fn(),select:vi.fn(),eq:vi.fn(),maybeSingle:vi.fn(),revisionCycle:vi.fn(),templates:vi.fn(),adminForm:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:mocks.requireProject}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("not found");}}));
vi.mock("@/components/revision-cycle-form",()=>({RevisionCycleForm:(props:unknown)=>{mocks.revisionCycle(props);return <div>Revision cycle fixture</div>;}}));
vi.mock("@/components/project-template-pack",()=>({ProjectTemplatePack:(props:unknown)=>{mocks.templates(props);return <div>Templates fixture</div>;}}));
vi.mock("@/components/record-admin-forms",()=>({ProjectAdminForm:(props:unknown)=>{mocks.adminForm(props);return <div>Project information fixture</div>;}}));
const organisationId="a0000000-0000-4000-8000-000000000001",projectId="b0000000-0000-4000-8000-000000000001";
const params=()=>Promise.resolve({organisationId,projectId});
const project={id:projectId,organisation_id:organisationId,code:"PRJ-001",name:"Export pipeline",description:null,status:"active",client_name:null,facility_location:null,client_logo_paths:[],revision_cycle_days:2};
beforeEach(()=>{
  vi.clearAllMocks();const chain={select:mocks.select,eq:mocks.eq,maybeSingle:mocks.maybeSingle};
  mocks.from.mockReturnValue(chain);mocks.select.mockReturnValue(chain);mocks.eq.mockReturnValue(chain);mocks.maybeSingle.mockResolvedValue({data:project});
  mocks.requireProject.mockResolvedValue({supabase:{from:mocks.from},access:{role:"project_admin"},preview:null});
});
afterEach(cleanup);

it("uses the existing large focus-visible button treatment for the Project overview return link",async()=>{
  render(await ProjectSettings({params:params()}));
  const back=screen.getByRole("link",{name:"Project overview"});
  expect(back.getAttribute("href")).toBe(`/app/${organisationId}/projects/${projectId}/overview`);
  expect(back.className).toContain("ev-button-secondary");expect(back.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(screen.getByRole("heading",{name:"Project information",level:1})).toBeTruthy();
  expect(mocks.requireProject).toHaveBeenCalledExactlyOnceWith(organisationId,projectId);
  expect(mocks.from).toHaveBeenCalledExactlyOnceWith("projects");expect(mocks.eq.mock.calls).toEqual([["organisation_id",organisationId],["id",projectId]]);
  expect(mocks.revisionCycle).toHaveBeenCalledExactlyOnceWith({organisationId,projectId,days:2,readOnly:false});
  expect(mocks.templates).toHaveBeenCalledExactlyOnceWith({organisationId,projectId,canManage:true});
  expect(mocks.adminForm).toHaveBeenCalledExactlyOnceWith({record:project});
  expect(screen.getByRole("link",{name:"Choose disciplines and events"}).getAttribute("href")).toBe(`/app/${organisationId}/settings/notifications?projectId=${projectId}`);
});
it("preserves audited preview read-only controls and hides personal notification settings",async()=>{
  mocks.requireProject.mockResolvedValue({supabase:{from:mocks.from},access:{role:"project_admin"},preview:{id:"preview-session"}});
  render(await ProjectSettings({params:params()}));
  expect(mocks.revisionCycle).toHaveBeenCalledExactlyOnceWith({organisationId,projectId,days:2,readOnly:true});
  expect(mocks.templates).toHaveBeenCalledExactlyOnceWith({organisationId,projectId,canManage:false});
  expect(screen.queryByRole("link",{name:"Choose disciplines and events"})).toBeNull();
  expect(screen.getByRole("link",{name:"Project overview"}).className).toContain("ev-button-secondary");
});
it.each(["organisation_admin","document_controller","engineer","viewer"])("keeps the existing Project Manager-only access guard for %s",async role=>{
  mocks.requireProject.mockResolvedValue({supabase:{from:mocks.from},access:{role},preview:null});
  await expect(ProjectSettings({params:params()})).rejects.toThrow("not found");expect(mocks.from).not.toHaveBeenCalled();
});
it("retains not-found handling when the authorised project cannot be loaded",async()=>{
  mocks.maybeSingle.mockResolvedValue({data:null});await expect(ProjectSettings({params:params()})).rejects.toThrow("not found");
  expect(mocks.revisionCycle).not.toHaveBeenCalled();expect(mocks.templates).not.toHaveBeenCalled();expect(mocks.adminForm).not.toHaveBeenCalled();
});
