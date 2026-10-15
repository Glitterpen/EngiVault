import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import OrganisationPage from "./page";
import {requireUser} from "@/lib/auth";
import type {ProjectSummary} from "@/lib/organisation-project-portfolio";

const {workspaceProps}=vi.hoisted(()=>({workspaceProps:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireUser:vi.fn()}));
vi.mock("next/navigation",()=>({
  notFound:vi.fn(()=>{throw new Error("NEXT_NOT_FOUND");}),
  redirect:vi.fn((href:string)=>{throw new Error(`NEXT_REDIRECT:${href}`);}),
}));
vi.mock("@/components/project-create-dialog",()=>({ProjectCreateDialog:({organisationId}:{organisationId:string})=><button data-organisation={organisationId}>New project</button>}));
vi.mock("@/components/organisation-logo",()=>({OrganisationLogo:({name}:{name:string})=><span>{name} logo</span>}));
vi.mock("@/components/project-logo",()=>({ProjectLogo:({name}:{name:string})=><span>{name} client logo</span>}));
vi.mock("@/components/organisation-projects-workspace",async load=>{
  const actual=await load<typeof import("@/components/organisation-projects-workspace")>();
  return {...actual,OrganisationProjectsWorkspace:(props:Parameters<typeof actual.OrganisationProjectsWorkspace>[0])=>{
    workspaceProps(props);
    return <actual.OrganisationProjectsWorkspace {...props}/>;
  }};
});

type Result={data:unknown;error:unknown;count?:number|null};
type Call={method:string;args:unknown[]};
type RecordedQuery={table:string;calls:Call[]};
const projectRows=[
  {project_id:"project-a",code:"P-001",name:"Refinery FEED",role:"project_admin",status:"active"},
  {project_id:"project-b",code:"P-002",name:"Terminal upgrade",role:"document_controller",status:"active"},
];
const progressRows=[
  {project_id:"project-a",progress_weight:100,progress_credit:50,overdue:false,lifecycle_status:"active"},
  {project_id:"project-b",progress_weight:100,progress_credit:20,overdue:true,lifecycle_status:"active"},
];
const issueRows=[{project_id:"project-a",severity:"high",status:"open"}];
const disciplineRows=[{project_id:"project-a",discipline:"Electrical"},{project_id:"project-a",discipline:"Instrumentation"}];
let organisation:Record<string,string>|null,organisationError:unknown,projectResult:Result;
let progressError:unknown,issueError:unknown,disciplineError:unknown;
let progressCount:number|undefined,issueCount:number|undefined;
let queries:RecordedQuery[];
const rpc=vi.fn(),from=vi.fn();

function query(table:string,result:()=>Result){
  const record:RecordedQuery={table,calls:[]};queries.push(record);
  const response=()=>{const value=result();return {...value,count:value.count??(Array.isArray(value.data)?value.data.length:null)};};
  const chain={
    select(...args:unknown[]){record.calls.push({method:"select",args});return chain;},
    eq(...args:unknown[]){record.calls.push({method:"eq",args});return chain;},
    in(...args:unknown[]){record.calls.push({method:"in",args});return chain;},
    neq(...args:unknown[]){record.calls.push({method:"neq",args});return chain;},
    order(...args:unknown[]){record.calls.push({method:"order",args});return chain;},
    range(...args:unknown[]){record.calls.push({method:"range",args});return chain;},
    maybeSingle(){return Promise.resolve(response());},
    then(resolve:(value:Result)=>unknown,reject?:(reason:unknown)=>unknown){return Promise.resolve(response()).then(resolve,reject);},
  };
  return chain;
}
beforeEach(()=>{
  vi.clearAllMocks();queries=[];
  organisation={organisation_id:"org",name:"Example Engineering",slug:"example",role:"organisation_admin"};
  organisationError=null;projectResult={data:projectRows,error:null};progressError=null;issueError=null;disciplineError=null;progressCount=undefined;issueCount=undefined;
  rpc.mockImplementation((name:string)=>{
    if(name==="get_my_organisations")return query(name,()=>({data:organisation,error:organisationError}));
    if(name==="get_accessible_projects")return Promise.resolve(projectResult);
    throw new Error(`Unexpected RPC ${name}`);
  });
  from.mockImplementation((table:string)=>{
    if(table==="project_document_progress")return query(table,()=>({data:progressError?null:progressRows,error:progressError,count:progressCount}));
    if(table==="project_issues")return query(table,()=>({data:issueError?null:issueRows,error:issueError,count:issueCount}));
    if(table==="project_member_disciplines")return query(table,()=>({data:disciplineError?null:disciplineRows,error:disciplineError}));
    throw new Error(`Unexpected table ${table}`);
  });
  vi.mocked(requireUser).mockResolvedValue({supabase:{rpc,from},user:{id:"current-user"}} as never);
});
afterEach(cleanup);
const page=()=>OrganisationPage({params:Promise.resolve({organisationId:"org"})});
const props=()=>workspaceProps.mock.lastCall?.[0] as {isAdmin:boolean;metrics?:{activeProjects:number;averageCompletion:number|null;attentionProjects:number|null;openIssues:number|null};projects:Array<{project_id:string;summary?:ProjectSummary}>;disciplines?:Record<string,string[]>;disciplinesAvailable?:boolean};

it("renders the administrator Projects workspace with creation and organisation tools",async()=>{
  render(await page());
  expect(requireUser).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading",{name:"Projects",level:1})).toBeTruthy();
  expect(screen.getByRole("button",{name:"New project"}).getAttribute("data-organisation")).toBe("org");
  expect(screen.getByRole("link",{name:"Manage organisation"}).getAttribute("href")).toBe("/app/org/settings");
  expect(screen.getByRole("link",{name:"Audit log"}).getAttribute("href")).toBe("/app/org/audit");
  expect(screen.getByRole("link",{name:"Plan & usage"}).getAttribute("href")).toBe("/app/org/subscription");
  expect(props().isAdmin).toBe(true);
  expect(props().metrics).toEqual(expect.objectContaining({activeProjects:2,averageCompletion:35,openIssues:1}));
});

it("scopes organisation lookup, project discovery and every aggregate query to this organisation and known projects",async()=>{
  render(await page());
  expect(rpc).toHaveBeenCalledWith("get_accessible_projects",{target_org:"org"});
  expect(queries.find(item=>item.table==="get_my_organisations")?.calls).toContainEqual({method:"eq",args:["organisation_id","org"]});
  for(const table of ["project_document_progress","project_issues"]){
    const aggregate=queries.find(item=>item.table===table)!;
    expect(aggregate).toBeTruthy();
    expect(aggregate.calls).toContainEqual({method:"eq",args:["organisation_id","org"]});
    expect(aggregate.calls).toContainEqual({method:"in",args:["project_id",["project-a","project-b"]]});
  }
  expect(queries.find(item=>item.table==="project_document_progress")?.calls).toContainEqual({method:"eq",args:["lifecycle_status","active"]});
  expect(queries.find(item=>item.table==="project_issues")?.calls).toContainEqual({method:"neq",args:["status","resolved"]});
  expect(from).not.toHaveBeenCalledWith("project_member_disciplines");
});

it.each(["archived","trashed"])("excludes %s projects from live progress and issue aggregate reads",async status=>{
  projectResult={data:[...projectRows,{project_id:"inactive-project",code:"P-003",name:"Retained project",role:"project_admin",status}],error:null};
  render(await page());
  for(const table of ["project_document_progress","project_issues"]){
    expect(queries.find(item=>item.table===table)?.calls).toContainEqual({method:"in",args:["project_id",["project-a","project-b"]]});
  }
  expect(props().projects.map(item=>item.project_id)).toContain("inactive-project");
  expect(props().metrics?.activeProjects).toBe(2);
});

it("shows team assignments without administrator controls, creation or portfolio aggregate reads",async()=>{
  organisation!.role="member";
  projectResult={data:projectRows.map(item=>({...item,role:"engineer"})),error:null};
  render(await page());
  expect(screen.getByRole("heading",{name:"My project assignments",level:1})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"New project"})).toBeNull();
  for(const name of ["Manage organisation","Audit log","Plan & usage"])expect(screen.queryByRole("link",{name})).toBeNull();
  expect(from).not.toHaveBeenCalledWith("project_document_progress");
  expect(from).not.toHaveBeenCalledWith("project_issues");
  expect(props().isAdmin).toBe(false);
  expect(props().metrics).toBeUndefined();
  expect(props().disciplines).toEqual(expect.objectContaining({"project-a":["Electrical","Instrumentation"]}));
  const disciplineQuery=queries.find(item=>item.table==="project_member_disciplines")!;
  expect(disciplineQuery.calls).toContainEqual({method:"eq",args:["organisation_id","org"]});
  expect(disciplineQuery.calls).toContainEqual({method:"eq",args:["user_id","current-user"]});
  expect(disciplineQuery.calls).toContainEqual({method:"in",args:["project_id",["project-a","project-b"]]});
});

it("preserves the Executive Viewer redirect without loading project or operational data",async()=>{
  organisation!.role="executive_viewer";
  await expect(page()).rejects.toThrow("NEXT_REDIRECT:/app/org/executive");
  expect(rpc).not.toHaveBeenCalledWith("get_accessible_projects",expect.anything());
  expect(from).not.toHaveBeenCalled();
  expect(workspaceProps).not.toHaveBeenCalled();
});

it("rejects an organisation outside the current identity before project reads",async()=>{
  organisation=null;
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(rpc).not.toHaveBeenCalledWith("get_accessible_projects",expect.anything());
  expect(from).not.toHaveBeenCalled();
  expect(workspaceProps).not.toHaveBeenCalled();
});

it("does not trust an errored organisation lookup even when stale data is present",async()=>{
  organisationError={message:"supabase stale identity diagnostics"};
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.queryByText(/supabase|stale identity diagnostics/i)).toBeNull();
  expect(rpc).not.toHaveBeenCalledWith("get_accessible_projects",expect.anything());
  expect(from).not.toHaveBeenCalled();
});

it.each([{name:"no rows",data:null},{name:"stale rows",data:projectRows}])("shows a safe project-load failure with $name instead of an empty portfolio",async({data})=>{
  projectResult={data,error:{message:"supabase PostgreSQL raw provider failure"}};
  render(await page());
  expect(screen.getByRole("alert").textContent).toMatch(/projects.*could not be loaded|could not load.*projects|unable to load.*projects/i);
  expect(screen.queryByText(/No authorised projects|No project assignments|No projects yet/i)).toBeNull();
  expect(screen.queryByText(/supabase|PostgreSQL|raw provider/i)).toBeNull();
  expect(from).not.toHaveBeenCalled();
});

it("keeps unknown progress as unavailable instead of inventing zero completion or health",async()=>{
  progressError={message:"supabase backend progress diagnostics"};
  render(await page());
  expect(screen.getByRole("alert").textContent).toMatch(/progress|portfolio|metrics|summary/i);
  expect(props().metrics?.averageCompletion).toBeNull();
  expect(props().metrics?.attentionProjects).toBeNull();
  expect(props().metrics?.openIssues).toBe(1);
  expect(props().projects.every(item=>item.summary?.completion===null&&item.summary.health===null)).toBe(true);
  expect(screen.queryByText(/supabase|backend progress diagnostics/i)).toBeNull();
  expect(props().projects.map(item=>item.project_id)).toEqual(["project-a","project-b"]);
});

it("keeps unknown issue and health metrics unavailable without losing valid completion",async()=>{
  issueError={message:"supabase backend issue diagnostics"};
  render(await page());
  expect(screen.getByRole("alert").textContent).toMatch(/issue|portfolio|metrics|summary/i);
  expect(props().metrics?.averageCompletion).toBe(35);
  expect(props().metrics?.openIssues).toBeNull();
  expect(props().metrics?.attentionProjects).toBeNull();
  expect(props().projects.every(item=>item.summary?.openIssues===null&&item.summary.health===null)).toBe(true);
  expect(screen.queryByText(/supabase|backend issue diagnostics/i)).toBeNull();
});

it.each(["progress","issues"])("treats a truncated %s result as unavailable rather than a complete healthy summary",async source=>{
  if(source==="progress")progressCount=1001;else issueCount=1001;
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(props().metrics?.attentionProjects).toBeNull();
  if(source==="progress")expect(props().metrics?.averageCompletion).toBeNull();
  else expect(props().metrics?.openIssues).toBeNull();
});

it("skips aggregate reads for a genuinely empty admin portfolio",async()=>{
  projectResult={data:[],error:null};
  render(await page());
  expect(screen.getByRole("heading",{name:"Projects",level:1})).toBeTruthy();
  expect(screen.getByRole("button",{name:"New project"})).toBeTruthy();
  expect(from).not.toHaveBeenCalled();
  expect(props().projects).toEqual([]);
});

it("does not query arbitrary projects for a team member without assignments",async()=>{
  organisation!.role="member";projectResult={data:[],error:null};
  render(await page());
  expect(screen.getByRole("heading",{name:"My project assignments",level:1})).toBeTruthy();
  expect(from).not.toHaveBeenCalled();
  expect(screen.queryByRole("button",{name:"New project"})).toBeNull();
  expect(props().projects).toEqual([]);
});

it("warns when member disciplines are unavailable instead of claiming there are no assignments",async()=>{
  organisation!.role="member";disciplineError={message:"supabase discipline diagnostics"};
  projectResult={data:projectRows.map(item=>({...item,role:"engineer"})),error:null};
  render(await page());
  expect(screen.getByRole("alert").textContent).toMatch(/discipline/i);
  expect(props().disciplinesAvailable).toBe(false);
  expect(screen.queryByText(/supabase|discipline diagnostics/i)).toBeNull();
  expect(screen.queryByText(/Awaiting discipline assignment|No disciplines assigned/i)).toBeNull();
  expect(from).not.toHaveBeenCalledWith("project_document_progress");
  expect(from).not.toHaveBeenCalledWith("project_issues");
});
