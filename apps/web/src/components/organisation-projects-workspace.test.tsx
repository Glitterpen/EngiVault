import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import type {ComponentProps} from "react";
import {OrganisationProjectsWorkspace} from "./organisation-projects-workspace";
import type {PortfolioProject,ProjectSummary} from "@/lib/organisation-project-portfolio";

vi.mock("@/components/organisation-logo",()=>({OrganisationLogo:({name}:{name:string})=><span role="img" aria-label={`${name} logo`}/>}));
vi.mock("@/components/project-logo",()=>({ProjectLogo:({name}:{name:string})=><span role="img" aria-label={`${name} client logo`}/>}));
afterEach(cleanup);

type Props=ComponentProps<typeof OrganisationProjectsWorkspace>;
const summary:ProjectSummary={completion:40,deliverables:10,overdue:2,openIssues:1,health:"Needs attention"};
function project(id:string,status="active",role="organisation_admin"):PortfolioProject&{summary:ProjectSummary}{return {project_id:id,code:`PRJ-${id}`,name:`Project ${id}`,role,status,summary:{...summary}};}
function workspace(overrides:Partial<Props>={}){
  return render(<OrganisationProjectsWorkspace organisationId="org" organisationName="Example Engineering" projects={[project("1"),project("2")]} isAdmin metrics={{activeProjects:2,averageCompletion:40,attentionProjects:2,openIssues:2}} createAction={<button type="button">New project</button>} {...overrides}/>);
}
function listedProjects(){return within(screen.getByRole("list",{name:"Projects"})).getAllByRole("listitem");}
function search(value:string){fireEvent.change(screen.getByRole("searchbox",{name:"Search projects"}),{target:{value}});}
function projectName(value:string){return (name:string)=>name===value||name.endsWith(` — ${value}`);}

describe("organisation project status navigation",()=>{
  it("shows active projects by default with labelled count buttons and explicit pressed state",()=>{
    workspace({projects:[project("1"),project("2"),project("archive","archived"),project("deleted","trashed")]});
    expect(screen.getByRole("heading",{level:1,name:"Projects"})).toBeTruthy();
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(screen.getByText("Example Engineering")).toBeTruthy();
    const nav=screen.getByRole("navigation",{name:"Project status"});
    expect(within(nav).getByRole("button",{name:/^Active\s*2$/}).getAttribute("aria-pressed")).toBe("true");
    expect(within(nav).getByRole("button",{name:/^Archived\s*1$/}).getAttribute("aria-pressed")).toBe("false");
    expect(within(nav).getByRole("button",{name:/^Deleted\s*1$/}).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("status").textContent).toBe("2 active projects");
    expect(listedProjects()).toHaveLength(2);
    expect(screen.queryByRole("heading",{name:projectName("Project archive")})).toBeNull();
    expect(screen.queryByRole("heading",{name:projectName("Project deleted")})).toBeNull();
  });
  it("keeps archives and deleted projects separate, preserving the deleted administration destination",()=>{
    workspace({projects:[project("current"),project("archive","archived"),project("deleted","trashed")]});
    fireEvent.click(screen.getByRole("button",{name:/^Archived\s*1$/}));
    expect(screen.getByRole("status").textContent).toBe("1 archived project");
    expect(screen.getByRole("button",{name:/^Archived\s*1$/}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link",{name:"Open project: PRJ-archive — Project archive"}).getAttribute("href")).toBe("/app/org/projects/archive/overview");
    expect(screen.queryByRole("heading",{name:projectName("Project current")})).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:/^Deleted\s*1$/}));
    expect(screen.getByRole("button",{name:/^Archived\s*1$/}).getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button",{name:/^Deleted\s*1$/}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("link",{name:"Manage deleted project: PRJ-deleted — Project deleted"}).getAttribute("href")).toBe("/app/org/projects/deleted/administration");
    expect(screen.getByRole("status").textContent).toBe("1 deleted project");
    expect(screen.queryByRole("heading",{name:projectName("Project archive")})).toBeNull();
  });
  it("does not offer empty archive/deleted tabs, but retains the active zero state",()=>{
    workspace({projects:[]});
    const nav=screen.getByRole("navigation",{name:"Project status"});
    expect(within(nav).getAllByRole("button")).toHaveLength(1);
    expect(within(nav).getByRole("button",{name:/^Active\s*0$/}).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading",{name:"No active projects"})).toBeTruthy();
    expect(screen.queryByRole("list",{name:"Projects"})).toBeNull();
    expect(screen.queryByRole("navigation",{name:"Project pages"})).toBeNull();
  });
});

describe("project search and paging",()=>{
  it("searches project code and title case-insensitively while retaining total status counts",()=>{
    workspace({projects:[{...project("alpha"),code:"LNG-001",name:"Terminal Upgrade"},{...project("beta"),code:"OIL-002",name:"Export Pipeline"},project("archived","archived")]});
    search("  lng-001  ");
    expect(screen.getByRole("heading",{name:projectName("Terminal Upgrade")})).toBeTruthy();
    expect(screen.queryByRole("heading",{name:projectName("Export Pipeline")})).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("1 matching active project");
    expect(screen.getByRole("button",{name:/^Active\s*2$/})).toBeTruthy();
    search("PIPELINE");
    expect(screen.getByRole("heading",{name:projectName("Export Pipeline")})).toBeTruthy();
    expect(screen.queryByRole("heading",{name:projectName("Terminal Upgrade")})).toBeNull();
  });
  it("clears an unmatched search through the visible action and restores the selected status view",()=>{
    workspace({projects:[project("active"),project("archive","archived")]});
    fireEvent.click(screen.getByRole("button",{name:/^Archived\s*1$/}));
    search("does not exist");
    expect(screen.getByRole("heading",{name:"No matching projects"})).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("0 matching archived projects");
    fireEvent.click(screen.getByRole("button",{name:"Clear search"}));
    expect((screen.getByRole("searchbox",{name:"Search projects"}) as HTMLInputElement).value).toBe("");
    expect(document.activeElement).toBe(screen.getByRole("searchbox",{name:"Search projects"}));
    expect(screen.getByRole("heading",{name:projectName("Project archive")})).toBeTruthy();
    expect(screen.queryByRole("heading",{name:projectName("Project active")})).toBeNull();
    expect(screen.getByRole("button",{name:/^Archived\s*1$/}).getAttribute("aria-pressed")).toBe("true");
  });
  it("paginates 25 projects into 12, 12 and 1 with natural project-code ordering and disabled endpoints",()=>{
    workspace({projects:Array.from({length:25},(_,index)=>project(String(25-index)))});
    const nav=screen.getByRole("navigation",{name:"Project pages"});
    expect(listedProjects()).toHaveLength(12);
    expect(screen.getByRole("heading",{name:projectName("Project 1")})).toBeTruthy();
    expect(screen.getByRole("heading",{name:projectName("Project 12")})).toBeTruthy();
    expect(screen.queryByRole("heading",{name:projectName("Project 13")})).toBeNull();
    expect(within(nav).getByText("Page 1 of 3")).toBeTruthy();
    expect((within(nav).getByRole("button",{name:"Previous"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(nav).getByRole("button",{name:"Next"}));
    expect(document.activeElement).toBe(screen.getByRole("region",{name:"Project results"}));
    expect(listedProjects()).toHaveLength(12);
    expect(screen.getByRole("heading",{name:projectName("Project 13")})).toBeTruthy();
    expect(screen.getByRole("heading",{name:projectName("Project 24")})).toBeTruthy();
    expect(within(nav).getByText("Page 2 of 3")).toBeTruthy();
    fireEvent.click(within(nav).getByRole("button",{name:"Next"}));
    expect(listedProjects()).toHaveLength(1);
    expect(screen.getByRole("heading",{name:projectName("Project 25")})).toBeTruthy();
    expect(within(nav).getByText("Page 3 of 3")).toBeTruthy();
    expect((within(nav).getByRole("button",{name:"Next"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(nav).getByRole("button",{name:"Previous"}));
    expect(screen.getByRole("heading",{name:projectName("Project 13")})).toBeTruthy();
  });
  it("resets paging after search changes and when changing project status",()=>{
    const active=Array.from({length:25},(_,index)=>project(String(index+1))),archived=Array.from({length:13},(_,index)=>project(`A-${index+1}`,"archived"));
    workspace({projects:[...active,...archived]});
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    search("Project 25");
    expect(listedProjects()).toHaveLength(1);
    expect(screen.getByRole("heading",{name:projectName("Project 25")})).toBeTruthy();
    search("");
    expect(screen.getByText("Page 1 of 3")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    fireEvent.click(screen.getByRole("button",{name:/^Archived\s*13$/}));
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(screen.getByRole("heading",{name:projectName("Project A-1")})).toBeTruthy();
    expect(listedProjects()).toHaveLength(12);
  });
  it("moves back immediately from a clamped page after refreshed project data shrinks",()=>{
    const projects=Array.from({length:25},(_,index)=>project(String(index+1)));
    const {rerender}=workspace({projects});
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    expect(screen.getByText("Page 3 of 3")).toBeTruthy();
    expect(screen.getByRole("heading",{name:projectName("Project 25")})).toBeTruthy();
    rerender(<OrganisationProjectsWorkspace organisationId="org" organisationName="Example Engineering" projects={projects.slice(0,13)} isAdmin/>);
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(listedProjects()).toHaveLength(1);
    expect(screen.getByRole("heading",{name:projectName("Project 13")})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Previous"}));
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    expect(listedProjects()).toHaveLength(12);
    expect(screen.getByRole("heading",{name:projectName("Project 1")})).toBeTruthy();
    expect(screen.queryByRole("heading",{name:projectName("Project 13")})).toBeNull();
    expect((screen.getByRole("button",{name:"Previous"}) as HTMLButtonElement).disabled).toBe(true);
    expect(document.activeElement).toBe(screen.getByRole("region",{name:"Project results"}));
  });
});

describe("member workspace boundaries and routes",()=>{
  const projects=[project("pm","active","project_admin"),project("dcc","active","document_controller"),project("engineer","active","engineer"),project("viewer","active","viewer")];
  it("retains each appointed role’s destination without exposing administrator tools or summary/create actions",()=>{
    workspace({projects,isAdmin:false,disciplines:{engineer:["Electrical","Instrumentation"]}});
    expect(screen.getByRole("heading",{level:1,name:"My project assignments"})).toBeTruthy();
    expect(screen.getByRole("list",{name:"Project assignments"})).toBeTruthy();
    for(const [id,route] of [["pm","overview"],["dcc","control"],["engineer","assignments"],["viewer","documents"]]){
      expect(screen.getByRole("link",{name:`Open project: PRJ-${id} — Project ${id}`}).getAttribute("href")).toBe(`/app/org/projects/${id}/${route}`);
    }
    expect(screen.getByText("Project Manager")).toBeTruthy();
    expect(screen.getByText("Document Controller")).toBeTruthy();
    expect(screen.getByText("Discipline Engineer")).toBeTruthy();
    expect(screen.getByText("Viewer")).toBeTruthy();
    expect(screen.getByText("Electrical")).toBeTruthy();
    expect(screen.getByText("Instrumentation")).toBeTruthy();
    expect(screen.queryByRole("navigation",{name:"Organisation actions"})).toBeNull();
    expect(screen.queryByRole("region",{name:"Active portfolio summary"})).toBeNull();
    expect(screen.queryByRole("button",{name:"New project"})).toBeNull();
    expect(screen.queryByRole("progressbar")).toBeNull();
    for(const name of ["Manage organisation","Audit log","Plan & usage"])expect(screen.queryByRole("link",{name})).toBeNull();
  });
  it("searches a member’s assigned discipline and role label without changing access links",()=>{
    workspace({projects,isAdmin:false,disciplines:{engineer:["Electrical","Instrumentation"]}});
    search("instrumentation");
    expect(screen.getByRole("heading",{name:projectName("Project engineer")})).toBeTruthy();
    expect(screen.queryByRole("heading",{name:projectName("Project dcc")})).toBeNull();
    expect(screen.getByRole("link",{name:"Open project: PRJ-engineer — Project engineer"}).getAttribute("href")).toBe("/app/org/projects/engineer/assignments");
    search("DOCUMENT CONTROLLER");
    expect(screen.getByRole("heading",{name:projectName("Project dcc")})).toBeTruthy();
    expect(screen.queryByRole("heading",{name:projectName("Project engineer")})).toBeNull();
    expect(screen.getByRole("link",{name:"Open project: PRJ-dcc — Project dcc"}).getAttribute("href")).toBe("/app/org/projects/dcc/control");
  });
  it("distinguishes unassigned disciplines from an unavailable discipline read",()=>{
    const {rerender}=workspace({projects:[project("engineer","active","engineer")],isAdmin:false});
    expect(screen.getByText("Awaiting discipline assignment")).toBeTruthy();
    expect(screen.queryByText("Discipline details unavailable")).toBeNull();
    rerender(<OrganisationProjectsWorkspace organisationId="org" organisationName="Example Engineering" projects={[project("engineer","active","engineer")]} isAdmin={false} disciplinesAvailable={false}/>);
    expect(screen.getByText("Discipline details unavailable")).toBeTruthy();
    expect(screen.queryByText("Awaiting discipline assignment")).toBeNull();
    expect(screen.getByRole("link",{name:"Open project: PRJ-engineer — Project engineer"})).toBeTruthy();
  });
});

describe("discipline engineer project dashboard",()=>{
  it("shows a compact active scope summary and direct deliverable actions without portfolio data",()=>{
    workspace({isAdmin:false,projects:[project("first","active","engineer"),project("second","active","engineer"),project("old","archived","engineer")],disciplines:{first:["Electrical","Instrumentation"],second:["Electrical"],old:["Process"]}});
    const scope=screen.getByRole("region",{name:"Your engineering work"});
    expect(within(scope).getByText("Active projects").nextElementSibling?.textContent).toBe("2");
    expect(within(scope).getByText("Discipline assignments").nextElementSibling?.textContent).toBe("3");
    const first=screen.getByRole("article",{name:projectName("Project first")});
    expect(within(first).getByRole("link",{name:"My Deliverables: PRJ-first — Project first"}).getAttribute("href")).toBe("/app/org/projects/first/assignments");
    expect(within(first).getByRole("list",{name:"Authorised disciplines for PRJ-first"}).textContent).toBe("ElectricalInstrumentation");
    expect(within(first).getByRole("link",{name:"Open project: PRJ-first — Project first"}).className).toContain("min-h-11");
    expect(within(first).queryByRole("progressbar")).toBeNull();
    expect(within(first).queryByText("MDR completion")).toBeNull();
    expect(screen.queryByRole("region",{name:"Active portfolio summary"})).toBeNull();
    expect(screen.queryByRole("button",{name:"New project"})).toBeNull();
  });

  it("keeps failed scope reads unknown and does not display a fabricated zero",()=>{
    workspace({isAdmin:false,projects:[project("engineer","active","engineer")],disciplinesAvailable:false});
    const scope=screen.getByRole("region",{name:"Your engineering work"});
    expect(within(scope).getByText("Discipline assignments").nextElementSibling?.textContent).toBe("Unavailable");
    expect(screen.getByText("Discipline details unavailable")).toBeTruthy();
    expect(screen.queryByText("Awaiting discipline assignment")).toBeNull();
    expect(screen.getByRole("link",{name:"My Deliverables: PRJ-engineer — Project engineer"}).getAttribute("href")).toBe("/app/org/projects/engineer/assignments");
  });

  it("does not add engineer summary counters to mixed-role or administrator portfolios",()=>{
    const {rerender}=workspace({isAdmin:false,projects:[project("engineer","active","engineer"),project("pm","active","project_admin")]});
    expect(screen.queryByRole("region",{name:"Your engineering work"})).toBeNull();
    expect(screen.getByRole("link",{name:"Open project: PRJ-pm — Project pm"}).getAttribute("href")).toBe("/app/org/projects/pm/overview");
    expect(screen.getByRole("link",{name:"My Deliverables: PRJ-engineer — Project engineer"})).toBeTruthy();
    rerender(<OrganisationProjectsWorkspace organisationId="org" organisationName="Example Engineering" projects={[project("admin")]} isAdmin/>);
    expect(screen.queryByRole("region",{name:"Your engineering work"})).toBeNull();
    expect(screen.queryByRole("link",{name:/^My Deliverables:/})).toBeNull();
  });

  it("retains full long names and discipline labels with safe mobile wrapping",()=>{
    const name="A very long engineering project name with multiple areas and facilities";
    const discipline="Telecommunications and complex instrumentation engineering";
    workspace({isAdmin:false,projects:[{...project("long","active","engineer"),name}],disciplines:{long:[discipline]}});
    const card=screen.getByRole("article",{name:projectName(name)});
    expect(within(card).getByRole("heading",{level:3}).className).toContain("break-words");
    expect(within(card).getByText(discipline).className).toContain("break-words");
    expect(within(card).getByRole("link",{name:`My Deliverables: PRJ-long — ${name}`}).textContent).toBe("My Deliverables");
    expect(within(card).getByRole("link",{name:`My Deliverables: PRJ-long — ${name}`}).className).toContain("w-full");
  });
});

describe("portfolio metrics and accessible project cards",()=>{
  it("shows administrator actions and gives the real progressbar a project-specific name and numeric range",()=>{
    workspace({projects:[project("1")],metrics:{activeProjects:1,averageCompletion:40,attentionProjects:1,openIssues:1}});
    const actions=screen.getByRole("navigation",{name:"Organisation actions"});
    expect(within(actions).getByRole("link",{name:"Manage organisation"}).getAttribute("href")).toBe("/app/org/settings");
    expect(within(actions).getByRole("link",{name:"Audit log"}).getAttribute("href")).toBe("/app/org/audit");
    expect(within(actions).getByRole("link",{name:"Plan & usage"}).getAttribute("href")).toBe("/app/org/subscription");
    expect(screen.getByRole("button",{name:"New project"})).toBeTruthy();
    expect(screen.getByRole("region",{name:"Active portfolio summary"})).toBeTruthy();
    const card=screen.getByRole("article",{name:projectName("Project 1")});
    expect(within(card).getByText("Needs attention")).toBeTruthy();
    const progressbar=within(card).getByRole("progressbar",{name:"PRJ-1 MDR completion"});
    expect(progressbar.getAttribute("aria-valuemin")).toBe("0");
    expect(progressbar.getAttribute("aria-valuemax")).toBe("100");
    expect(progressbar.getAttribute("aria-valuenow")).toBe("40");
    expect(within(card).getByText("40%")).toBeTruthy();
    for(const label of ["Deliverables","Overdue","Open issues"])expect(within(card).getByText(label).tagName).toBe("DT");
  });
  it("renders unavailable figures as unavailable, not fabricated zero progress or healthy state",()=>{
    const unknown={completion:null,deliverables:null,overdue:null,openIssues:null,health:null};
    workspace({projects:[{...project("1"),summary:unknown}],metrics:{activeProjects:1,averageCompletion:null,attentionProjects:null,openIssues:null},notice:<p role="alert">Project summaries could not be refreshed.</p>});
    const metrics=screen.getByRole("region",{name:"Active portfolio summary"});
    expect(within(metrics).getAllByText("Unavailable")).toHaveLength(3);
    const card=screen.getByRole("article",{name:projectName("Project 1")});
    expect(within(card).getByText("Health unavailable")).toBeTruthy();
    expect(within(card).getAllByText("Unavailable")).toHaveLength(4);
    expect(within(card).queryByRole("progressbar")).toBeNull();
    expect(within(card).queryByText("0%")).toBeNull();
    expect(within(card).queryByText("On track")).toBeNull();
    expect(within(card).queryByText("Setup required")).toBeNull();
    expect(screen.getByRole("alert").textContent).toBe("Project summaries could not be refreshed.");
    expect(within(card).getByRole("link",{name:"Open project: PRJ-1 — Project 1"})).toBeTruthy();
  });
  it("distinguishes genuine zero completion and counts from unavailable data",()=>{
    workspace({projects:[{...project("1"),summary:{completion:0,deliverables:0,overdue:0,openIssues:0,health:"Setup required"}}],metrics:{activeProjects:1,averageCompletion:0,attentionProjects:0,openIssues:0}});
    const card=screen.getByRole("article",{name:projectName("Project 1")});
    expect(within(card).getByText("Setup required")).toBeTruthy();
    expect(within(card).getByRole("progressbar",{name:"PRJ-1 MDR completion"}).getAttribute("aria-valuenow")).toBe("0");
    expect(within(card).getByText("0%")).toBeTruthy();
    expect(within(card).getAllByText("0",{exact:true})).toHaveLength(3);
    expect(screen.queryByText("Unavailable")).toBeNull();
  });
  it("keeps full long project names and literal user strings in accessible headings and link names",()=>{
    const name=`Long project ${"name ".repeat(60)}<script>alert('unsafe')</script>`;
    const organisationName='Engineering <img src=x onerror="alert(1)"> & Co';
    const {container}=workspace({organisationName,projects:[{...project("long"),name,code:'PRJ-<unsafe>&"'}]});
    expect(screen.getByText(organisationName)).toBeTruthy();
    const heading=screen.getByRole("heading",{name:projectName(name),level:3});
    expect(heading.textContent).toBe(name);
    const card=screen.getByRole("article",{name:projectName(name)});
    expect(card.getAttribute("aria-labelledby")).toBe(heading.id);
    expect(within(card).getByRole("link",{name:`Open project: PRJ-<unsafe>&" — ${name}`})).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img[onerror]")).toBeNull();
  });
});
