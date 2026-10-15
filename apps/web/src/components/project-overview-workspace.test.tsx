import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {ComponentProps,FormEvent} from "react";
import {ProjectOverviewWorkspace} from "./project-overview-workspace";
import type {OverviewIssue,ProjectOverviewSummary} from "@/lib/project-overview-summary";

vi.mock("@/components/project-logo",()=>({ProjectLogo:({name}:{name:string})=><span role="img" aria-label={`${name} client logo`}/>}));

type Props=ComponentProps<typeof ProjectOverviewWorkspace>;
const resolveIssue=vi.fn(async()=>{});
const reportIssue=vi.fn((event:FormEvent)=>event.preventDefault());
const project:Props["project"]={code:"FEED-001",name:"Example FEED project",planned_start_date:"2026-10-01",planned_end_date:"2027-03-31",delivery_stage:"feed",revision_cycle_days:3};
const summary:ProjectOverviewSummary={completion:42,deliverables:101,overdue:3,openIssues:2,engineers:7,dcc:1,health:"Needs attention",resources:[]};
function issue(id:string,overrides:Partial<OverviewIssue>={}):OverviewIssue{
  return {id,title:`Issue ${id}`,description:`Description ${id}`,severity:"medium",status:"open",owner_name:"Issue owner",due_date:"2026-10-20",created_at:"2026-10-01T10:00:00Z",...overrides};
}
function resource(id:string,discipline:string,gap:number|null,overrides:Partial<ProjectOverviewSummary["resources"][number]>={}):ProjectOverviewSummary["resources"][number]{
  return {id,discipline,required_count:3,assigned:gap===null?null:3-gap,gap,notes:null,...overrides};
}
function props(overrides:Partial<Props>={}):Props{
  return {organisationId:"org",projectId:"project",project:{...project},role:"project_admin",preview:false,summary:{...summary,resources:[]},issues:[],issuesAvailable:true,resourcesAvailable:true,
    brief:<p data-testid="brief-content">Project brief content</p>,revisionCycle:<p data-testid="cycle-content">Revision cycle form</p>,
    issueForm:<form onSubmit={reportIssue}><label>Issue title<input name="title" defaultValue=""/></label><button type="submit">Submit issue</button></form>,resolveIssueAction:resolveIssue,...overrides};
}
function workspace(overrides:Partial<Props>={}){const values=props(overrides);return {...render(<ProjectOverviewWorkspace {...values}/>),values};}
function datum(label:string){return screen.getByText(label,{selector:"dt"}).nextElementSibling!;}
function issuesRegion(){return screen.getByRole("region",{name:/^Project issues/});}
function issueResults(){return screen.getByRole("region",{name:"Issue results"});}
function listedIssues(){return within(issueResults()).queryAllByRole("heading",{level:3}).map(item=>item.textContent);}
function issueDisclosure(title:string){return screen.getByRole("heading",{level:3,name:title}).closest("details")!;}
function expandIssue(title:string){const disclosure=issueDisclosure(title);fireEvent.click(disclosure.querySelector("summary")!);return disclosure;}
function resourceRegion(){return screen.getByRole("region",{name:/^Resource readiness/});}
function listedResources(){return within(screen.getByRole("list",{name:"Discipline resource requirements"})).getAllByRole("heading",{level:3}).map(item=>item.textContent);}

beforeEach(()=>{
  resolveIssue.mockClear();reportIssue.mockClear();
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event("close"));}});
});
afterEach(()=>{expect(resolveIssue).not.toHaveBeenCalled();expect(reportIssue).not.toHaveBeenCalled();cleanup();vi.restoreAllMocks();});

describe("compact project overview summary",()=>{
  it("keeps one project heading, a labelled progress indicator, semantic metrics and UTC dates",()=>{
    workspace();
    expect(screen.getByRole("heading",{level:1,name:"Example FEED project"})).toBeTruthy();
    expect(screen.getByText("FEED-001 · Project overview")).toBeTruthy();
    expect(screen.getByRole("img",{name:"Example FEED project client logo"})).toBeTruthy();
    const progress=screen.getByRole("progressbar",{name:"Stage-weighted MDR completion"});
    expect(progress.getAttribute("aria-valuenow")).toBe("42");expect(progress.getAttribute("aria-valuemin")).toBe("0");expect(progress.getAttribute("aria-valuemax")).toBe("100");
    expect((progress.firstElementChild as HTMLElement).style.width).toBe("42%");
    expect(screen.getByText("42%")).toBeTruthy();expect(screen.getByText("Needs attention")).toBeTruthy();
    for(const [label,value] of [["MDR deliverables","101"],["Overdue","3"],["Open issues","2"],["Engineers","7"],["Document controllers","1"],["Planned start","01 Oct 2026"],["Planned completion","31 Mar 2027"]])expect(datum(label).textContent).toBe(value);
    expect(datum("Overdue").className).toContain("text-[#9b2c24]");
  });
  it("shows genuine zero progress/counts as zero, not unavailable",()=>{
    workspace({summary:{...summary,completion:0,deliverables:0,overdue:0,openIssues:0,engineers:0,dcc:0,health:"Setup required"}});
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("0");expect(screen.getByText("0%")).toBeTruthy();
    for(const label of ["MDR deliverables","Overdue","Open issues","Engineers","Document controllers"])expect(datum(label).textContent).toBe("0");
    expect(datum("Overdue").className).not.toContain("text-[#9b2c24]");
  });
  it("does not fabricate zero progress, health or counts when their sources are unavailable",()=>{
    workspace({summary:{completion:null,deliverables:null,overdue:null,openIssues:null,engineers:null,dcc:null,health:null,resources:[]},issuesAvailable:false,resourcesAvailable:false});
    expect(screen.queryByRole("progressbar")).toBeNull();expect(screen.queryByText("0%")).toBeNull();
    expect(screen.getByText("Health unavailable")).toBeTruthy();
    for(const label of ["MDR deliverables","Overdue","Open issues","Engineers","Document controllers"])expect(datum(label).textContent).toBe("Unavailable");
    expect(within(issuesRegion()).getByText(/Project issues are unavailable/)).toBeTruthy();
    expect(within(resourceRegion()).getByText("Status unavailable")).toBeTruthy();
  });
  it.each([null,"not-a-date"])("marks missing or invalid planned dates as Not planned (%s)",date=>{
    workspace({project:{...project,planned_start_date:date,planned_end_date:date}});
    expect(datum("Planned start").textContent).toBe("Not planned");expect(datum("Planned completion").textContent).toBe("Not planned");
  });
  it("keeps milestone guidance optional and FEED completion tied to accepted IFD",()=>{
    workspace();expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(screen.getByRole("button",{name:"Project completion milestones"}));
    const guidance=screen.getByRole("tooltip");
    expect(guidance.textContent).toContain("FEED workflow");expect(guidance.textContent).toContain("Issued for Design (IFD) after DCC acceptance");
    expect(guidance.textContent).toContain("Incomplete uploads do not earn completion");
  });
});

describe("overview links and mutation boundaries",()=>{
  it("keeps report, templates, team, settings and back routes scoped to this organisation/project",()=>{
    workspace();
    for(const [name,href] of [["Back to projects","/app/org"],["Project report","/app/org/projects/project/reports"],["Team & resources","/app/org/projects/project/team"],["Project templates","/app/org/projects/project/templates"],["Project settings","/app/org/projects/project/settings"],["Manage team & resources","/app/org/projects/project/team"]])expect(screen.getByRole("link",{name}).getAttribute("href")).toBe(href);
    expect(screen.getByRole("navigation",{name:"Project overview actions"})).toBeTruthy();
    expect(screen.queryByRole("link",{name:"Admin controls"})).toBeNull();expect(screen.getByRole("button",{name:"Report issue"})).toBeTruthy();
  });
  it("gives an organisation administrator oversight/leadership links but no project mutation controls",()=>{
    workspace({role:"organisation_admin",issues:[issue("1")]});
    expect(screen.getByRole("link",{name:"Project leadership"}).getAttribute("href")).toBe("/app/org/projects/project/team");
    expect(screen.getByRole("link",{name:"Admin controls"}).getAttribute("href")).toBe("/app/org/projects/project/administration");
    expect(screen.getByRole("link",{name:"View project team"})).toBeTruthy();
    expect(screen.queryByRole("link",{name:"Project settings"})).toBeNull();expect(screen.queryByRole("button",{name:"Report issue"})).toBeNull();
    const disclosure=expandIssue("Issue 1");expect(disclosure.querySelector("form")).toBeNull();
  });
  it.each(["document_controller","engineer","viewer","executive_viewer","unknown"])("never grants project management controls to %s",role=>{
    workspace({role,issues:[issue("1")]});expandIssue("Issue 1");
    expect(screen.queryByRole("link",{name:"Project settings"})).toBeNull();expect(screen.queryByRole("link",{name:"Admin controls"})).toBeNull();
    expect(screen.queryByRole("button",{name:"Report issue"})).toBeNull();expect(screen.queryByRole("button",{name:"Resolve issue"})).toBeNull();
    expect(screen.getByRole("link",{name:"Project report"})).toBeTruthy();expect(screen.getByRole("link",{name:"Project templates"})).toBeTruthy();
  });
  it("keeps audited project-manager preview read-only, including expanded issue details",()=>{
    workspace({preview:true,issues:[issue("1")]});expandIssue("Issue 1");
    expect(screen.queryByRole("button",{name:"Report issue"})).toBeNull();expect(screen.queryByRole("button",{name:"Resolve issue"})).toBeNull();
    expect(screen.queryByRole("link",{name:"Project settings"})).toBeNull();expect(screen.getByRole("link",{name:"View project team"})).toBeTruthy();
    fireEvent.focus(screen.getByRole("button",{name:"Project overview guidance"}));
    expect(screen.getByRole("tooltip").textContent).toContain("This audited preview is read-only");
  });
  it("does not render a Report issue trigger when no authorised form slot is supplied",()=>{
    workspace({issueForm:undefined});expect(screen.queryByRole("button",{name:"Report issue"})).toBeNull();
  });
});

describe("issue triage and disclosures",()=>{
  it("sorts open/monitoring issues by severity then newest date without mutating the input",()=>{
    const issues=[issue("high-old",{severity:"high",created_at:"2026-10-01T10:00:00Z"}),issue("low",{severity:"low",created_at:"2026-10-20T10:00:00Z"}),issue("critical",{severity:"critical",created_at:"2026-09-01T10:00:00Z"}),issue("medium",{status:"monitoring"}),issue("high-new",{severity:"high",created_at:"2026-10-15T10:00:00Z"})];
    const original=issues.map(item=>item.id);workspace({issues});
    expect(listedIssues()).toEqual(["Issue critical","Issue high-new","Issue high-old","Issue medium","Issue low"]);
    expect(issues.map(item=>item.id)).toEqual(original);
  });
  it("uses stable identifiers to break equal severity/date ties",()=>{
    workspace({issues:[issue("b"),issue("a")]});expect(listedIssues()).toEqual(["Issue a","Issue b"]);
  });
  it("segregates resolved issues and sorts those newest first regardless of old severity",()=>{
    workspace({issues:[issue("open"),issue("resolved-old",{status:"resolved",severity:"critical",created_at:"2026-10-01T10:00:00Z"}),issue("resolved-new",{status:"resolved",severity:"low",created_at:"2026-10-15T10:00:00Z"})]});
    const nav=screen.getByRole("navigation",{name:"Issue status"});
    const open=within(nav).getByRole("button",{name:/^Open\s*1$/}),resolved=within(nav).getByRole("button",{name:/^Resolved\s*2$/});
    expect(open.getAttribute("aria-pressed")).toBe("true");expect(resolved.getAttribute("aria-pressed")).toBe("false");expect(listedIssues()).toEqual(["Issue open"]);
    fireEvent.click(resolved);expect(resolved.getAttribute("aria-pressed")).toBe("true");expect(open.getAttribute("aria-pressed")).toBe("false");
    expect(listedIssues()).toEqual(["Issue resolved-new","Issue resolved-old"]);
    const disclosure=expandIssue("Issue resolved-new");expect(disclosure.querySelector("form")).toBeNull();
    expect(screen.queryByRole("button",{name:"Resolve issue"})).toBeNull();
  });
  it("keeps descriptions/actions collapsed by default and binds Resolve to exact issue/project scope",()=>{
    workspace({issues:[issue("risk",{description:"First line\nSecond line",owner_name:"Lead engineer",due_date:"2026-10-20"})]});
    const disclosure=issueDisclosure("Issue risk");expect(disclosure.open).toBe(false);
    // JSDOM does not hide closed-details descendants in role queries; verify
    // the action is contained by the native collapsed disclosure instead.
    expect(screen.getByRole("button",{name:"Resolve issue"}).closest("details")).toBe(disclosure);
    expandIssue("Issue risk");expect(disclosure.open).toBe(true);
    expect(within(disclosure).getByText("First line Second line").className).toContain("whitespace-pre-line");
    expect(within(disclosure).getByText("Lead engineer · Due 20 Oct 2026")).toBeTruthy();
    const resolve=within(disclosure).getByRole("button",{name:"Resolve issue"});
    expect(Object.fromEntries(new FormData(resolve.closest("form")!))).toEqual({organisationId:"org",projectId:"project",issueId:"risk",status:"resolved"});
    expect(resolve.closest("[data-preview-safe]")).toBeNull();expect(resolve.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
  it("uses truthful fallback text for missing issue description/owner/due date",()=>{
    workspace({issues:[issue("1",{description:null,owner_name:null,due_date:null})]});
    const disclosure=expandIssue("Issue 1");
    expect(within(disclosure).getByText("No additional description.")).toBeTruthy();expect(within(disclosure).getByText("Unassigned · Due Not planned")).toBeTruthy();
  });
  it("distinguishes a known empty issue list from an unavailable issue source",()=>{
    const result=workspace();
    expect(screen.getByText("No open project issues.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/^Resolved\s*0$/}));expect(screen.getByText("No resolved project issues.")).toBeTruthy();
    result.rerender(<ProjectOverviewWorkspace {...result.values} issuesAvailable={false}/>);
    expect(screen.getByText(/Project issues are unavailable/)).toBeTruthy();expect(screen.queryByText("No open project issues.")).toBeNull();expect(screen.queryByText("No resolved project issues.")).toBeNull();
    expect(screen.queryByRole("navigation",{name:"Issue status"})).toBeNull();
  });
});

describe("issue pagination",()=>{
  function manyIssues(count:number){return Array.from({length:count},(_,index)=>issue(String(index+1),{created_at:`2026-10-${String(index+1).padStart(2,"0")}T10:00:00Z`}));}
  it("shows five issues per page with endpoint controls, live page status and focus on results",()=>{
    workspace({issues:manyIssues(11)});
    const nav=screen.getByRole("navigation",{name:"Issue pages"});
    expect(listedIssues()).toEqual(["Issue 11","Issue 10","Issue 9","Issue 8","Issue 7"]);
    expect(within(nav).getByRole("status").textContent).toBe("Page 1 of 3");expect(within(nav).getByRole("status").getAttribute("aria-live")).toBe("polite");
    expect((within(nav).getByRole("button",{name:"Previous"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(nav).getByRole("button",{name:"Next"}));
    expect(listedIssues()).toEqual(["Issue 6","Issue 5","Issue 4","Issue 3","Issue 2"]);expect(document.activeElement).toBe(issueResults());
    fireEvent.click(within(nav).getByRole("button",{name:"Next"}));
    expect(listedIssues()).toEqual(["Issue 1"]);expect(within(nav).getByRole("status").textContent).toBe("Page 3 of 3");
    expect((within(nav).getByRole("button",{name:"Next"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(nav).getByRole("button",{name:"Previous"}));expect(listedIssues()).toHaveLength(5);expect(within(nav).getByRole("status").textContent).toBe("Page 2 of 3");
  });
  it("clamps after refreshed data shrinks and Previous moves immediately from the visible page",()=>{
    const issues=manyIssues(11),result=workspace({issues});
    fireEvent.click(screen.getByRole("button",{name:"Next"}));fireEvent.click(screen.getByRole("button",{name:"Next"}));
    result.rerender(<ProjectOverviewWorkspace {...result.values} issues={issues.slice(0,6)}/>);
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();expect(listedIssues()).toEqual(["Issue 1"]);
    fireEvent.click(screen.getByRole("button",{name:"Previous"}));
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();expect(listedIssues()).toEqual(["Issue 6","Issue 5","Issue 4","Issue 3","Issue 2"]);
    expect(document.activeElement).toBe(issueResults());
  });
  it("resets paging when switching between open and resolved views",()=>{
    workspace({issues:[...manyIssues(7),issue("resolved",{status:"resolved"})]});
    fireEvent.click(screen.getByRole("button",{name:"Next"}));expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:/^Resolved\s*1$/}));expect(listedIssues()).toEqual(["Issue resolved"]);expect(screen.queryByRole("navigation",{name:"Issue pages"})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:/^Open\s*7$/}));expect(screen.getByText("Page 1 of 2")).toBeTruthy();expect(listedIssues()[0]).toBe("Issue 7");
  });
});

describe("resource readiness",()=>{
  it("shows largest gaps first, five disciplines initially and all on demand without changing source order",()=>{
    const resources=[resource("safety","Safety",0),resource("process","Process",3),resource("civil","Civil",0),resource("electrical","Electrical",2),resource("mechanical","Mechanical",0),resource("piping","Piping",1),resource("instrumentation","Instrumentation",0)];
    const original=resources.map(item=>item.id);workspace({summary:{...summary,resources}});
    expect(listedResources()).toEqual(["Process","Electrical","Piping","Civil","Instrumentation"]);expect(resources.map(item=>item.id)).toEqual(original);
    expect(within(resourceRegion()).getByText("6 unfilled positions")).toBeTruthy();
    const toggle=screen.getByRole("button",{name:"Show all 7 disciplines"});expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(toggle.getAttribute("aria-controls")).toBe(screen.getByRole("list",{name:"Discipline resource requirements"}).id);
    fireEvent.click(toggle);expect(listedResources()).toEqual(["Process","Electrical","Piping","Civil","Instrumentation","Mechanical","Safety"]);
    const fewer=screen.getByRole("button",{name:"Show fewer disciplines"});expect(fewer.getAttribute("aria-expanded")).toBe("true");fireEvent.click(fewer);expect(listedResources()).toHaveLength(5);
  });
  it("shows known assignment counts, vacancies and notes accurately",()=>{
    workspace({summary:{...summary,resources:[resource("1","Electrical",1,{required_count:2,assigned:1,notes:"HV engineer needed"})]}});
    const region=resourceRegion();expect(within(region).getByText("1 unfilled position")).toBeTruthy();expect(within(region).getByText("1 / 2 assigned")).toBeTruthy();
    expect(within(region).getByText(/1 vacancy/).textContent).toContain("HV engineer needed");expect(screen.queryByRole("button",{name:/Show all/})).toBeNull();
  });
  it("does not fabricate vacancies or Resourced when team assignment readiness is unknown",()=>{
    workspace({summary:{...summary,engineers:null,dcc:null,resources:[resource("1","Electrical",null)]}});
    const region=resourceRegion();expect(within(region).getByText("Status unavailable")).toBeTruthy();expect(within(region).getByText("Assigned unavailable")).toBeTruthy();expect(within(region).getByText("Readiness unavailable")).toBeTruthy();
    expect(within(region).queryByText(/vacanc/i)).toBeNull();expect(within(region).queryByText("Resourced")).toBeNull();expect(within(region).queryByText(/0 \/ 3 assigned/)).toBeNull();
  });
  it("keeps unavailable requirements separate from a genuine empty setup",()=>{
    const result=workspace({resourcesAvailable:false});
    expect(within(resourceRegion()).getByText(/Resource requirements are unavailable/)).toBeTruthy();expect(screen.queryByRole("list",{name:"Discipline resource requirements"})).toBeNull();
    expect(within(resourceRegion()).queryByText("0 disciplines")).toBeNull();expect(within(resourceRegion()).queryByText("No discipline resource requirements have been set.")).toBeNull();
    result.rerender(<ProjectOverviewWorkspace {...result.values} resourcesAvailable/>);
    expect(within(resourceRegion()).getByText("0 disciplines")).toBeTruthy();expect(within(resourceRegion()).getByText("No discipline resource requirements have been set.")).toBeTruthy();
  });
});

describe("occasional planning and issue reporting",()=>{
  it("uses native, initially collapsed disclosures for brief and revision cycle with supplied content intact",()=>{
    workspace();
    const section=screen.getByRole("region",{name:"Project details and planning"});
    const brief=within(section).getByText("Project brief & objectives").closest("details")!;
    const cycle=within(section).getByText("Revision cycle").closest("details")!;
    expect(brief.open).toBe(false);expect(cycle.open).toBe(false);expect(within(cycle).getByText("3 working days")).toBeTruthy();
    expect(brief.querySelector("summary")?.className).toContain("min-h-11");expect(cycle.querySelector("summary")?.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    fireEvent.click(brief.querySelector("summary")!);fireEvent.click(cycle.querySelector("summary")!);
    expect(brief.open).toBe(true);expect(cycle.open).toBe(true);expect(within(brief).getByTestId("brief-content").textContent).toBe("Project brief content");expect(within(cycle).getByTestId("cycle-content").textContent).toBe("Revision cycle form");
  });
  it("keeps an unset cycle labelled Not set rather than implying a configured period",()=>{
    workspace({project:{...project,revision_cycle_days:null}});expect(screen.getByText("Not set")).toBeTruthy();
  });
  it("opens Report issue on demand and preserves draft/focus across native keyboard dismissal",()=>{
    workspace();const trigger=screen.getByRole("button",{name:"Report issue"});
    expect(trigger.hasAttribute("data-preview-safe")).toBe(false);expect(screen.queryByRole("dialog",{name:"Report an issue"})).toBeNull();expect(screen.queryByLabelText("Issue title")).toBeNull();
    fireEvent.click(trigger);const dialog=screen.getByRole("dialog",{name:"Report an issue"}) as HTMLDialogElement;
    expect(trigger.getAttribute("aria-controls")).toBe(dialog.id);expect(trigger.getAttribute("aria-expanded")).toBe("true");
    const input=within(dialog).getByLabelText("Issue title");fireEvent.change(input,{target:{value:"Draft issue title"}});
    expect(within(dialog).getByRole("button",{name:"Submit issue"}).closest("[data-preview-safe]")).toBeNull();
    // Escape closes a native top-layer dialog and fires close. JSDOM lacks a
    // top layer, so invoke the resulting close lifecycle without submitting.
    act(()=>dialog.close());expect(document.activeElement).toBe(trigger);expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);expect((screen.getByLabelText("Issue title") as HTMLInputElement).value).toBe("Draft issue title");
    const close=screen.getByRole("button",{name:"Close report an issue"});expect(close.getAttribute("type")).toBe("button");fireEvent.click(close);expect(document.activeElement).toBe(trigger);
  });
  it("removes an already-open reporting form if refreshed access becomes preview-only",()=>{
    const result=workspace();fireEvent.click(screen.getByRole("button",{name:"Report issue"}));
    expect(screen.getByRole("dialog",{name:"Report an issue"})).toBeTruthy();
    result.rerender(<ProjectOverviewWorkspace {...result.values} preview/>);
    expect(screen.queryByRole("dialog",{name:"Report an issue"})).toBeNull();expect(screen.queryByLabelText("Issue title")).toBeNull();expect(screen.queryByRole("button",{name:"Report issue"})).toBeNull();
    expect(document.body.style.overflow).not.toBe("hidden");
  });
  it("keeps an externally supplied availability notice above the work panels",()=>{
    workspace({notice:<p role="alert">Some project information could not be refreshed.</p>});
    expect(screen.getByRole("alert").textContent).toBe("Some project information could not be refreshed.");
  });
});
