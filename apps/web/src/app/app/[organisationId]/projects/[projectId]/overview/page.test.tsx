import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import ProjectOverview from "./page";
import {requireProject} from "@/lib/auth";

const {workspaceProps,briefProps,revisionProps}=vi.hoisted(()=>({workspaceProps:vi.fn(),briefProps:vi.fn(),revisionProps:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn((href:string)=>{throw new Error(`NEXT_REDIRECT:${href}`);})}));
vi.mock("@/app/app/workflow-actions",()=>({setProjectIssueStatus:vi.fn()}));
vi.mock("@/components/project-logo",()=>({ProjectLogo:({name}:{name:string})=><span role="img" aria-label={`${name} client logo`}/>}));
vi.mock("@/components/project-management-forms",()=>({
  EditableProjectBrief:(props:{editable?:boolean})=>{briefProps(props);return props.editable?<button>Edit project brief</button>:<p>Project brief is read-only</p>;},
  ProjectIssueForm:()=> <form aria-label="Report project issue"><button>Report issue</button></form>,
}));
vi.mock("@/components/revision-cycle-form",()=>({RevisionCycleForm:(props:{readOnly?:boolean})=>{
  revisionProps(props);return props.readOnly?<p>Revision cycle is read-only</p>:<button>Save revision cycle</button>;
}}));
vi.mock("@/components/project-overview-workspace",async load=>{
  const actual=await load<typeof import("@/components/project-overview-workspace")>();
  return {...actual,ProjectOverviewWorkspace:(props:Parameters<typeof actual.ProjectOverviewWorkspace>[0])=>{
    workspaceProps(props);return <actual.ProjectOverviewWorkspace {...props}/>;
  }};
});

type Result={data:unknown;error:unknown;count?:number|null};
type Call={method:string;args:unknown[]};
type Query={table:string;calls:Call[]};
type Summary={completion:number|null;deliverables:number|null;overdue:number|null;openIssues:number|null;engineers:number|null;dcc:number|null;health:string|null;resources:Array<{discipline:string;assigned:number|null;gap:number|null}>};
type Captured={organisationId:string;projectId:string;role:string;preview:boolean;summary:Summary;issues:unknown[];issuesAvailable:boolean;resourcesAvailable:boolean;issueForm?:unknown};
const project={id:"project",organisation_id:"org",code:"PRJ-001",name:"Refinery FEED",description:"Existing description",project_introduction:"Controlled project introduction",key_objectives:["Issue the design package"],planned_start_date:"2026-10-01",planned_end_date:"2026-12-01",delivery_stage:"feed",revision_cycle_days:3};
const progress=[{progress_weight:1,progress_credit:100,overdue:false,uploaded:true},{progress_weight:3,progress_credit:20,overdue:true,uploaded:false}];
const issues=[{id:"issue",title:"Interface confirmation",description:"Awaiting scope confirmation",severity:"high",status:"open",owner_name:"Project lead",due_date:"2026-10-20",created_at:"2026-10-15T10:00:00Z"}];
const resources=[{id:"resource",discipline:"Electrical",required_count:2,notes:null}];
const team=[{user_id:"dcc",display_name:"Controller",email:"dcc@example.test",role:"document_controller",disciplines:[]},{user_id:"engineer",display_name:"Engineer",email:"engineer@example.test",role:"engineer",disciplines:["Electrical"]}];
const categories=[{code:"EL",name:"Electrical",kind:"discipline"}];
const rpc=vi.fn(),from=vi.fn();
let role:string,preview:unknown,queries:Query[],results:Record<string,Result>;

function query(table:string){
  const record:Query={table,calls:[]};queries.push(record);
  const response=()=>{const value=results[table];return {...value,count:value.count??(Array.isArray(value.data)?value.data.length:null)};};
  const chain={
    select(...args:unknown[]){record.calls.push({method:"select",args});return chain;},
    eq(...args:unknown[]){record.calls.push({method:"eq",args});return chain;},
    order(...args:unknown[]){record.calls.push({method:"order",args});return chain;},
    range(...args:unknown[]){record.calls.push({method:"range",args});return chain;},
    single(){return Promise.resolve(response());},
    then(resolve:(value:Result)=>unknown,reject?:(reason:unknown)=>unknown){return Promise.resolve(response()).then(resolve,reject);},
  };
  return chain;
}
beforeEach(()=>{
  vi.clearAllMocks();role="project_admin";preview=undefined;queries=[];
  results={projects:{data:project,error:null},project_document_progress:{data:progress,error:null},project_issues:{data:issues,error:null},project_resource_plans:{data:resources,error:null},get_project_team:{data:team,error:null},get_project_document_categories:{data:categories,error:null}};
  from.mockImplementation((table:string)=>{
    if(!results[table])throw new Error(`Unexpected table ${table}`);
    return query(table);
  });
  rpc.mockImplementation(async(name:string)=>{
    if(!results[name])throw new Error(`Unexpected RPC ${name}`);
    return results[name];
  });
  vi.mocked(requireProject).mockImplementation(async()=>({supabase:{from,rpc},access:{role},preview} as never));
});
afterEach(cleanup);
const page=()=>ProjectOverview({params:Promise.resolve({organisationId:"org",projectId:"project"})});
const props=()=>workspaceProps.mock.lastCall?.[0] as Captured;

it("loads the authorised Project Manager overview with valid summary data and editing slots",async()=>{
  render(await page());
  expect(requireProject).toHaveBeenCalledWith("org","project");
  expect(props()).toMatchObject({organisationId:"org",projectId:"project",role:"project_admin",preview:false,issuesAvailable:true,resourcesAvailable:true});
  expect(props().summary).toMatchObject({completion:40,deliverables:2,overdue:1,openIssues:1,engineers:1,dcc:1});
  expect(props().summary.resources).toEqual([expect.objectContaining({discipline:"Electrical",assigned:1,gap:1})]);
  expect(briefProps).toHaveBeenCalledWith(expect.objectContaining({editable:true,organisationId:"org",projectId:"project"}));
  expect(revisionProps).toHaveBeenCalledWith(expect.objectContaining({readOnly:false,days:3}));
  expect(props().issueForm).toBeTruthy();
  expect(screen.getByRole("button",{name:"Resolve issue",hidden:true}).closest("[data-preview-safe]")).toBeNull();
});

it("preserves genuine zero values for a successfully loaded project without deliverables or staffing",async()=>{
  for(const source of ["project_document_progress","project_issues","project_resource_plans","get_project_team","get_project_document_categories"])results[source]={data:[],error:null};
  render(await page());
  expect(props().summary).toMatchObject({completion:0,deliverables:0,overdue:0,openIssues:0,engineers:0,dcc:0,health:"Setup required",resources:[]});
  expect(props().issuesAvailable).toBe(true);expect(props().resourcesAvailable).toBe(true);
  expect(screen.queryByRole("alert")).toBeNull();
});

it("scopes every source to the authorised organisation and project, requesting exact aggregate counts",async()=>{
  render(await page());
  const projectRead=queries.find(item=>item.table==="projects")!;
  expect(projectRead.calls).toContainEqual({method:"eq",args:["organisation_id","org"]});
  expect(projectRead.calls).toContainEqual({method:"eq",args:["id","project"]});
  for(const table of ["project_document_progress","project_issues","project_resource_plans"]){
    const source=queries.find(item=>item.table===table)!;
    expect(source.calls).toContainEqual({method:"eq",args:["organisation_id","org"]});
    expect(source.calls).toContainEqual({method:"eq",args:["project_id","project"]});
    expect(source.calls.find(call=>call.method==="select")?.args[1]).toEqual({count:"exact"});
  }
  expect(queries.find(item=>item.table==="project_document_progress")?.calls).toContainEqual({method:"eq",args:["lifecycle_status","active"]});
  expect(queries.find(item=>item.table==="project_issues")?.calls).toContainEqual({method:"order",args:["created_at",{ascending:false}]});
  for(const name of ["get_project_team","get_project_document_categories"])expect(rpc).toHaveBeenCalledWith(name,{target_organisation:"org",target_project:"project"},{count:"exact"});
});

it.each([
  ["document_controller","control"],
  ["engineer","assignments"],
  ["viewer","documents"],
  ["executive_viewer","documents"],
])("redirects %s before any overview source queries",async(nonManagement,destination)=>{
  role=nonManagement;
  await expect(page()).rejects.toThrow(`NEXT_REDIRECT:/app/org/projects/project/${destination}`);
  expect(from).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
  expect(workspaceProps).not.toHaveBeenCalled();
});

it("does not read overview data if requireProject rejects access",async()=>{
  vi.mocked(requireProject).mockRejectedValueOnce(new Error("NEXT_NOT_FOUND"));
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(from).not.toHaveBeenCalled();expect(rpc).not.toHaveBeenCalled();
});

it("gives Organisation Administrators read-only execution controls",async()=>{
  role="organisation_admin";
  render(await page());
  expect(briefProps).toHaveBeenCalledWith(expect.objectContaining({editable:false}));
  expect(revisionProps).toHaveBeenCalledWith(expect.objectContaining({readOnly:true}));
  expect(props().issueForm).toBeUndefined();
  expect(screen.queryByRole("button",{name:"Resolve issue",hidden:true})).toBeNull();
  expect(screen.queryByRole("button",{name:"Edit project brief",hidden:true})).toBeNull();
  expect(screen.queryByRole("button",{name:"Save revision cycle",hidden:true})).toBeNull();
});

it("keeps an audited Project Manager preview read-only despite its management perspective",async()=>{
  preview={id:"audited-preview"};
  render(await page());
  expect(props().preview).toBe(true);
  expect(briefProps).toHaveBeenCalledWith(expect.objectContaining({editable:false}));
  expect(revisionProps).toHaveBeenCalledWith(expect.objectContaining({readOnly:true}));
  expect(props().issueForm).toBeUndefined();
  expect(screen.queryByRole("button",{name:"Resolve issue",hidden:true})).toBeNull();
  expect(screen.queryByRole("button",{name:"Edit project brief",hidden:true})).toBeNull();
  expect(screen.queryByRole("button",{name:"Save revision cycle",hidden:true})).toBeNull();
});

it("keeps non-mutating issue and resource navigation usable inside the audited preview boundary",async()=>{
  preview={id:"audited-preview"};
  results.project_issues={data:[...Array.from({length:6},(_,index)=>({...issues[0],id:`issue-${index}`})),{...issues[0],id:"resolved",status:"resolved"}],error:null};
  const names=["Electrical","Process","Mechanical","Civil","Instrumentation","Pipeline"];
  results.project_resource_plans={data:names.map((discipline,index)=>({...resources[0],id:`resource-${index}`,discipline})),error:null};
  results.get_project_document_categories={data:names.map((name,index)=>({code:`D${index}`,name,kind:"discipline"})),error:null};
  render(await page());
  for(const button of [
    screen.getByRole("button",{name:/^Open\s*6$/}),screen.getByRole("button",{name:/^Resolved\s*1$/}),
    screen.getByRole("button",{name:"Previous"}),screen.getByRole("button",{name:"Next"}),
    screen.getByRole("button",{name:"Show all 6 disciplines"}),
  ])expect(button.hasAttribute("data-preview-safe")).toBe(true);
  expect(screen.queryByRole("button",{name:"Resolve issue",hidden:true})).toBeNull();
});

it.each([{name:"missing project",data:null,error:null},{name:"failed project",data:null,error:{message:"supabase raw project diagnostics"}},{name:"stale project on failure",data:project,error:{message:"supabase stale project diagnostics"}}])("shows a generic fallback for a $name without rendering invented project data",async({data,error})=>{
  results.projects={data,error};
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("Project overview could not be loaded.");
  expect(screen.queryByText(/supabase|raw project diagnostics|stale project diagnostics/i)).toBeNull();
  expect(workspaceProps).not.toHaveBeenCalled();
});

it("keeps failed progress and health unavailable instead of reporting zero completion",async()=>{
  results.project_document_progress={data:null,error:{message:"supabase progress diagnostics"}};
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(props().summary).toMatchObject({completion:null,deliverables:null,overdue:null,health:null,openIssues:1});
  expect(screen.queryByText(/supabase|progress diagnostics/i)).toBeNull();
});

it("keeps failed issues unavailable without erasing valid progress or claiming healthy status",async()=>{
  results.project_issues={data:null,error:{message:"supabase issue diagnostics"}};
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(props().summary).toMatchObject({completion:40,openIssues:null,health:null});
  expect(props().issuesAvailable).toBe(false);expect(props().issues).toEqual([]);
  expect(screen.queryByText("No project issues have been reported.")).toBeNull();
  expect(screen.queryByText(/supabase|issue diagnostics/i)).toBeNull();
});

it("keeps failed team counts and resource assignments unknown instead of showing staffing zeros",async()=>{
  results.get_project_team={data:null,error:{message:"supabase team diagnostics"}};
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(props().summary).toMatchObject({engineers:null,dcc:null});
  expect(briefProps).toHaveBeenCalledWith(expect.objectContaining({dccCount:null}));
  expect(props().summary.resources.every(resource=>resource.assigned===null&&resource.gap===null)).toBe(true);
  expect(screen.queryByText(/supabase|team diagnostics/i)).toBeNull();
});

it.each(["project_resource_plans","get_project_document_categories"])("does not fabricate empty readiness when %s fails",async source=>{
  results[source]={data:null,error:{message:"supabase resource diagnostics"}};
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(props().resourcesAvailable).toBe(false);
  expect(screen.queryByText("No discipline resource requirements have been set.")).toBeNull();
  expect(screen.queryByText(/supabase|resource diagnostics/i)).toBeNull();
});

it.each(["project_document_progress","project_issues","project_resource_plans","get_project_team","get_project_document_categories"])("marks capped %s reads unavailable rather than trusting a partial summary",async source=>{
  results[source]={...results[source],count:1001};
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  if(source==="project_document_progress")expect(props().summary).toMatchObject({completion:null,deliverables:null,overdue:null,health:null});
  else if(source==="project_issues"){expect(props().summary.openIssues).toBeNull();expect(props().issuesAvailable).toBe(false);}
  else if(source==="get_project_team")expect(props().summary).toMatchObject({engineers:null,dcc:null});
  else expect(props().resourcesAvailable).toBe(false);
});
