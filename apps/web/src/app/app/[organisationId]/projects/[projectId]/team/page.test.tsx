import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import TeamPage from "./page";
import {requireProject} from "@/lib/auth";
import {ProjectTeamDirectory} from "@/components/project-team-directory";
import {ProjectInviteDialog} from "@/components/project-invite-dialog";
import {PendingProjectInvitations} from "@/components/pending-project-invitations";
import {ProjectDisciplineManager} from "@/components/project-discipline-manager";
import {ResourcePlanForm} from "@/components/project-management-forms";
import {AdminPreviewBoundary} from "@/components/admin-preview-boundary";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn((href:string)=>{throw new Error(`redirect:${href}`);}),useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/components/help-tip",()=>({HelpTip:()=>null}));
vi.mock("@/components/project-team-directory",()=>({ProjectTeamDirectory:vi.fn(()=> <div data-testid="team-directory"><input data-preview-safe aria-label="Rendered team search"/><button type="button">Rendered member change</button></div>)}));
vi.mock("@/components/project-invite-dialog",()=>({ProjectInviteDialog:vi.fn(({label}:{label:string})=> <button type="button">{label}</button>)}));
vi.mock("@/components/pending-project-invitations",()=>({PendingProjectInvitations:vi.fn(()=> <section data-testid="pending-invitations"/>)}));
vi.mock("@/components/project-discipline-manager",()=>({ProjectDisciplineManager:vi.fn(()=> <section data-testid="discipline-manager"/>)}));
vi.mock("@/components/project-management-forms",()=>({ResourcePlanForm:vi.fn(()=> <form data-testid="resource-form"><button>Rendered resource change</button></form>)}));

const organisationId="a0000000-0000-4000-8000-000000000001";
const projectId="b0000000-0000-4000-8000-000000000001";
const userId="manager-user";
const base=`/app/${organisationId}/projects/${projectId}`;
const members=[
  {user_id:userId,display_name:"Project Manager",email:"manager@example.test",role:"project_admin",disciplines:[]},
  {user_id:"dcc-user",display_name:"Document Controller",email:"dcc@example.test",role:"document_controller",disciplines:[]},
  {user_id:"multi-engineer",display_name:"Multi-Discipline Engineer",email:"multi@example.test",role:"engineer",disciplines:["  PROCESS  ","Electrical"]},
  {user_id:"process-engineer",display_name:"Process Engineer",email:"process@example.test",role:"engineer",disciplines:["Process"]},
  {user_id:"retained-engineer",display_name:"Retained Mechanical Engineer",email:"retained@example.test",role:"engineer",disciplines:["Mechanical"]},
  {user_id:"unassigned-engineer",display_name:"Unassigned Engineer",email:"unassigned@example.test",role:"engineer",disciplines:[]},
];
const disciplines=[{code:"PRO",name:"Process",kind:"discipline"},{code:"ELE",name:"Electrical",kind:"discipline"}];
const categories=[...disciplines,{code:"BOD",name:"Basis of Design",kind:"document_type"}];
const plans=[
  {id:"process-plan",discipline:"Process",required_count:3,notes:"Current process requirement"},
  {id:"electrical-plan",discipline:"Electrical",required_count:2,notes:null},
  {id:"removed-plan",discipline:"Mechanical",required_count:99,notes:"Retained archived requirement must not count"},
];
const invitation=(project_role:string,index:number)=>({invitation_id:`pending-${index}`,email:`pending-${index}@example.test`,project_role,discipline:project_role==="engineer"?"Process":null,created_at:"2026-10-14T09:00:00Z",last_sent_at:"2026-10-15T09:00:00Z",expires_at:"2026-10-22T09:00:00Z",send_count:1,expired:false});
const pending=[invitation("engineer",1),invitation("project_admin",2),invitation("document_controller",3),invitation("viewer",4)];
type Result={data:unknown;error:unknown};
let results:Record<string,Result>;
let role:string;
let preview:Parameters<typeof AdminPreviewBoundary>[0]["preview"];
const rpc=vi.fn();
const from=vi.fn();
const queries=new Map<string,ReturnType<typeof query>>();

function query(result:Result){
  const builder={
    select:vi.fn(()=>builder),
    eq:vi.fn(()=>builder),
    order:vi.fn(()=>builder),
    then:<TResult1=Result,TResult2=never>(
      fulfilled?:((value:Result)=>TResult1|PromiseLike<TResult1>)|null,
      rejected?:((reason:unknown)=>TResult2|PromiseLike<TResult2>)|null,
    )=>Promise.resolve(result).then(fulfilled,rejected),
  };
  return builder;
}
const page=()=>TeamPage({params:Promise.resolve({organisationId,projectId})});
const directoryProps=()=>vi.mocked(ProjectTeamDirectory).mock.calls[0][0];
function summaryValue(label:string){return within(within(screen.getByRole("region",{name:"Team summary"})).getByText(label).closest("article")!).getByText(/^\d+$/).textContent;}

beforeEach(()=>{
  vi.clearAllMocks();
  queries.clear();
  role="project_admin";
  preview=null;
  results={
    get_project_team:{data:members,error:null},
    get_project_document_categories:{data:categories,error:null},
    get_pending_project_invitations:{data:pending,error:null},
    project_resource_plans:{data:plans,error:null},
    project_disciplines:{data:[{name:"Mechanical",code:"MEC"},{name:"Former discipline",code:null}],error:null},
  };
  rpc.mockImplementation(async(name:string)=>results[name]);
  from.mockImplementation((table:string)=>{
    const builder=query(results[table]);queries.set(table,builder);return builder;
  });
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{rpc,from},user:{id:userId},access:{role},preview} as never));
});

afterEach(cleanup);

it("keeps the existing authenticated tenant and project scope on every team/resource read",async()=>{
  render(await page());
  expect(requireProject).toHaveBeenCalledWith(organisationId,projectId);
  expect(rpc.mock.calls).toEqual([
    ["get_project_team",{target_organisation:organisationId,target_project:projectId}],
    ["get_project_document_categories",{target_organisation:organisationId,target_project:projectId}],
    ["get_pending_project_invitations",{target_organisation:organisationId,target_project:projectId}],
  ]);
  expect(from.mock.calls).toEqual([["project_resource_plans"],["project_disciplines"]]);
  for(const builder of queries.values()){
    expect(builder.eq).toHaveBeenCalledWith("organisation_id",organisationId);
    expect(builder.eq).toHaveBeenCalledWith("project_id",projectId);
  }
  expect(queries.get("project_resource_plans")?.select).toHaveBeenCalledWith("id,discipline,required_count,notes");
  expect(queries.get("project_resource_plans")?.order).toHaveBeenCalledWith("discipline");
  expect(queries.get("project_disciplines")?.select).toHaveBeenCalledWith("name,code");
  expect(queries.get("project_disciplines")?.eq).toHaveBeenCalledWith("is_active",false);
  expect(queries.get("project_disciplines")?.order).toHaveBeenCalledWith("name");
});

it("passes the manager's entire accepted team, current identity and discipline-only catalogue to the directory",async()=>{
  render(await page());
  expect(directoryProps()).toEqual({organisationId,projectId,members,disciplines,role:"project_admin",currentUserId:userId,emptyMessage:"No active project members."});
  expect(summaryValue("Active members")).toBe("6");
  expect(screen.getByRole("heading",{level:1,name:"Project team & resources"})).toBeTruthy();
  expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
  expect(screen.getByRole("link",{name:"Project overview"}).getAttribute("href")).toBe(`${base}/overview`);
});

it("keeps manager invitations restricted to engineers and strips disallowed pending roles",async()=>{
  render(await page());
  expect(vi.mocked(ProjectInviteDialog).mock.calls[0][0]).toEqual({organisationId,projectId,disciplines,allowedRoles:["engineer"],label:"Invite discipline engineer"});
  expect(vi.mocked(PendingProjectInvitations).mock.calls[0][0]).toEqual({organisationId,projectId,invitations:[pending[0]]});
  expect(summaryValue("Pending invitations")).toBe("1");
});

it("keeps resource planning secondary and collapsed without unmounting or changing form scope",async()=>{
  render(await page());
  expect(vi.mocked(ResourcePlanForm).mock.calls[0][0]).toEqual({organisationId,projectId,disciplines,embedded:true});
  const disclosure=screen.getByTestId("resource-form").closest("details");
  expect(disclosure?.open).toBe(false);
  expect(disclosure?.querySelector("summary")?.textContent).toBe("Plan discipline resources");
  expect(vi.mocked(ProjectDisciplineManager).mock.calls[0][0]).toEqual({organisationId,projectId,disciplines,removedDisciplines:[{name:"Mechanical",code:"MEC"},{name:"Former discipline",code:""}],readOnly:false});
});

it("calculates readiness only for active disciplines and counts multi-discipline engineers in each authorised scope",async()=>{
  render(await page());
  expect(summaryValue("Planned positions")).toBe("5");
  expect(summaryValue("Unfilled positions")).toBe("2");
  expect(within(screen.getByRole("region",{name:"Process resource coverage"})).getByText("2 / 3 active")).toBeTruthy();
  expect(within(screen.getByRole("region",{name:"Electrical resource coverage"})).getByText("1 / 2 active")).toBeTruthy();
  expect(screen.queryByRole("region",{name:"Mechanical resource coverage"})).toBeNull();
  expect(document.body.textContent).not.toContain("Retained archived requirement must not count");
  expect(directoryProps().members).toContain(members[4]);
});

it("restricts organisation administrators to leadership appointments, not engineer/resource management",async()=>{
  role="organisation_admin";
  render(await page());
  expect(screen.getByRole("heading",{level:1,name:"Project leadership appointments"})).toBeTruthy();
  expect(directoryProps()).toMatchObject({members:members.slice(0,2),role,currentUserId:userId});
  expect(vi.mocked(ProjectInviteDialog).mock.calls[0][0]).toMatchObject({allowedRoles:["project_admin","document_controller"],label:"Appoint Project Manager or DCC"});
  expect(vi.mocked(PendingProjectInvitations).mock.calls[0][0]).toMatchObject({invitations:[pending[1],pending[2]]});
  expect(summaryValue("Active members")).toBe("2");
  expect(summaryValue("Pending invitations")).toBe("2");
  expect(ResourcePlanForm).not.toHaveBeenCalled();
  expect(ProjectDisciplineManager).not.toHaveBeenCalled();
  expect(screen.queryByRole("heading",{name:"Discipline resource readiness"})).toBeNull();
  expect(from.mock.calls).toEqual([["project_resource_plans"]]);
});

it("keeps DCC engineer visibility read-only and skips unavailable invitation-management reads",async()=>{
  role="document_controller";
  render(await page());
  expect(screen.getByRole("heading",{level:1,name:"Discipline engineers"})).toBeTruthy();
  expect(directoryProps()).toMatchObject({members:members.filter(member=>member.role==="engineer"),role,emptyMessage:"No discipline engineers have joined this project yet."});
  expect(summaryValue("Active members")).toBe("4");
  expect(ProjectInviteDialog).not.toHaveBeenCalled();
  expect(PendingProjectInvitations).not.toHaveBeenCalled();
  expect(ResourcePlanForm).not.toHaveBeenCalled();
  expect(ProjectDisciplineManager).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalledWith("get_pending_project_invitations",expect.anything());
  expect(screen.queryByText("Pending invitations")).toBeNull();
  expect(screen.getByRole("link",{name:"Document control centre"}).getAttribute("href")).toBe(`${base}/control`);
  expect(screen.getByRole("link",{name:"Review submissions"}).getAttribute("href")).toBe(`${base}/reviews`);
  expect(from.mock.calls).toEqual([["project_resource_plans"]]);
});

it.each([["engineer","assignments"],["viewer","documents"],["executive_viewer","documents"],["unknown","documents"]])("redirects %s before any team, invitation or resource reads",async(nextRole,path)=>{
  role=nextRole;
  await expect(page()).rejects.toThrow(`redirect:${base}/${path}`);
  expect(from).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
  expect(ProjectTeamDirectory).not.toHaveBeenCalled();
  expect(ProjectInviteDialog).not.toHaveBeenCalled();
});

it("preserves the manager's read scope in audited preview while forwarding the discipline read-only flag",async()=>{
  preview={organisationId,projectId,role:"project_admin",displayName:"Project Manager",disciplines:[],expiresAt:"2099-10-16T20:00:00Z"};
  render(<AdminPreviewBoundary preview={preview}>{await page()}</AdminPreviewBoundary>);
  expect(directoryProps()).toMatchObject({members,role:"project_admin"});
  expect(vi.mocked(ProjectDisciplineManager).mock.calls[0][0]).toMatchObject({readOnly:true});
  expect((screen.getByRole("textbox",{name:"Rendered team search"}) as HTMLInputElement).disabled).toBe(false);
  expect((screen.getByRole("button",{name:"Rendered member change"}) as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByTestId("resource-form").querySelector("button") as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole("button",{name:"Invite discipline engineer"}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("region",{name:"Process resource coverage"})).toBeTruthy();
});

it("does not gain management tools when viewing the audited DCC role",async()=>{
  role="document_controller";
  preview={organisationId,projectId,role:"document_controller",displayName:"Document Controller",disciplines:[],expiresAt:"2099-10-16T20:00:00Z"};
  render(await page());
  expect(directoryProps()).toMatchObject({role:"document_controller",members:members.filter(member=>member.role==="engineer")});
  expect(ProjectInviteDialog).not.toHaveBeenCalled();
  expect(ResourcePlanForm).not.toHaveBeenCalled();
  expect(ProjectDisciplineManager).not.toHaveBeenCalled();
});

it.each(["project_admin","organisation_admin"])("keeps an honestly empty pending invitation list secondary for %s",async(nextRole)=>{
  role=nextRole;
  results.get_pending_project_invitations={data:[],error:null};
  render(await page());
  expect(PendingProjectInvitations).not.toHaveBeenCalled();
  const disclosure=screen.getByText("0 awaiting acceptance").closest("details");
  expect(disclosure?.open).toBe(false);
  expect(disclosure?.textContent).toContain("No invitations are awaiting acceptance");
  expect(summaryValue("Pending invitations")).toBe("0");
});

it("passes honestly empty successful team and catalogue reads without manufacturing access or resource plans",async()=>{
  for(const key of Object.keys(results))results[key]={data:[],error:null};
  render(await page());
  expect(directoryProps()).toMatchObject({members:[],disciplines:[]});
  expect(summaryValue("Active members")).toBe("0");
  expect(summaryValue("Planned positions")).toBe("0");
  expect(summaryValue("Unfilled positions")).toBe("0");
  expect(screen.getByText("No discipline requirements have been planned yet. Add a resource requirement below.")).toBeTruthy();
  expect(screen.getByText("No requirements")).toBeTruthy();
  expect(screen.queryByText("Fully resourced")).toBeNull();
});

it.each(["get_project_team","get_pending_project_invitations"])("fails closed instead of presenting missing %s data as an empty or manageable team",async(name)=>{
  results[name]={data:null,error:{message:"private_provider_detail must_not_reach_ui"}};
  await expect(page()).rejects.toThrow("Project team details could not be loaded. Please retry.");
  expect(ProjectTeamDirectory).not.toHaveBeenCalled();
  expect(ProjectInviteDialog).not.toHaveBeenCalled();
  expect(ResourcePlanForm).not.toHaveBeenCalled();
  expect(ProjectDisciplineManager).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalledWith("project_disciplines");
  expect(document.body.textContent).not.toMatch(/private_provider_detail|must_not_reach_ui/);
});

it.each(["get_project_document_categories","project_resource_plans"])("does not render misleading resource coverage when %s fails",async(name)=>{
  results[name]={data:null,error:{code:"XX000"}};
  await expect(page()).rejects.toThrow("Project resource readiness could not be loaded. Please retry.");
  expect(ProjectTeamDirectory).not.toHaveBeenCalled();
  expect(ResourcePlanForm).not.toHaveBeenCalled();
});

it("does not offer discipline management when removed-discipline settings fail to load",async()=>{
  results.project_disciplines={data:null,error:{code:"XX000"}};
  await expect(page()).rejects.toThrow("Project discipline settings could not be loaded. Please contact EngiCite support.");
  expect(ProjectDisciplineManager).not.toHaveBeenCalled();
  expect(ProjectTeamDirectory).not.toHaveBeenCalled();
});
