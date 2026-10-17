import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {renderToString} from "react-dom/server";
import {hydrateRoot,type Root} from "react-dom/client";
import ProjectReportsPage from "@/app/app/[organisationId]/projects/[projectId]/reports/page";
import ProjectReportPage from "@/app/app/[organisationId]/projects/[projectId]/reports/[reportId]/page";
import {ProjectReportControls} from "@/components/project-report-controls";
import {ProjectSCurve} from "@/components/project-s-curve";
import {projectReportSnapshotSchema} from "@/lib/project-report";
import styles from "@/components/project-report-presentation.module.css";

const mocks=vi.hoisted(()=>({requireProject:vi.fn(),from:vi.fn(),push:vi.fn(),save:vi.fn(),generate:vi.fn(),fetch:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireProject:mocks.requireProject}));
vi.mock("next/navigation",()=>({notFound:()=>{throw new Error("NEXT_NOT_FOUND");},useRouter:()=>({push:mocks.push})}));
vi.mock("@/app/app/project-report-actions",()=>({generateProjectReport:mocks.generate,saveProjectReportSchedule:mocks.save}));
vi.mock("@/components/organisation-logo",()=>({OrganisationLogo:({name}:{name:string})=><span role="img" aria-label={`${name} logo`}/>}));
vi.mock("@/components/project-logo",()=>({ProjectLogo:({name,index}:{name:string;index:number})=><span role="img" aria-label={`${name} client logo ${index}`}/>}));
vi.mock("@/components/help-tip",()=>({HelpTip:({label}:{label:string})=><button type="button" aria-label={label}>?</button>}));

const base="/app/org/projects/project";
const longName="FEED engineering project with a very long controlled project name and client identity";
const discipline="Electrical and Instrumentation Engineering";
const snapshot=projectReportSnapshotSchema.parse({
  identity:{organisation_name:"Engineering Organisation Limited",project_code:"FEED-001",project_name:longName,client_name:"Operating Client Limited",facility_location:"Terminal site",project_introduction:"Controlled engineering project brief",key_objectives:["Complete FEED scope"],planned_start_date:"2026-09-07",planned_end_date:"2026-10-30",client_logo_count:3},
  summary:{overall_progress:50,previous_progress:40,progress_gain:10,total_deliverables:10,uploaded_deliverables:8,approved_deliverables:5,overdue_deliverables:2,weekly_submissions:3,weekly_acceptances:2,weekly_due:4},
  disciplines:[{discipline,total:10,uploaded:8,approved:5,overdue:2,progress:50,weekly_submissions:3,weekly_acceptances:2}],
  lookahead:[{document_number:"EL-002",title:"Planned cable schedule",discipline,responsible_party:"Discipline Engineer",planned_submission_date:"2026-10-23",required_issue_status:"Issued for Design (IFD)"}],
  weekly_issued_deliverables:[{document_number:"EL-001",title:"Accepted electrical load list",discipline,revision_code:"R01",issue_status:"Issued for Review (IFR)",issued_at:"2026-10-15T10:00:00Z"}],
  challenges:[{title:"Confirm client inputs",description:"Awaiting controlled data",severity:"high",status:"open",owner_name:"Project Manager",due_date:"2026-10-20"}],
  s_curve:{overall:[{date:"2026-09-07",planned:0,completed:0},{date:"2026-09-14",planned:5,completed:3},{date:"2026-09-21",planned:10,completed:null}],disciplines:[{discipline,planned:10,completed:5,variance:-5,completion_percent:50}]},
});
const report={id:"report",report_number:7,period_start:"2026-10-09",period_end:"2026-10-16",generation_source:"manual",generated_at:"2026-10-16T12:00:00Z",snapshot};
let role:string,reads:{table:string;filters:[string,unknown][]}[];
function query(table:string){
  const data=table==="projects"?{code:"FEED-001",name:longName,delivery_stage:"feed"}:table==="project_report_settings"?{generation_weekday:5,enabled:true,last_generated_at:report.generated_at}:[report];
  const result={data,error:null,count:Array.isArray(data)?data.length:1};
  const read={table,filters:[] as [string,unknown][]};reads.push(read);
  const chain={select:()=>chain,eq:(column:string,value:unknown)=>{read.filters.push([column,value]);return chain;},in:()=>chain,range:()=>chain,order:()=>chain,single:async()=>result,maybeSingle:async()=>({...result,data:Array.isArray(data)?data[0]:data}),then:Promise.resolve(result).then.bind(Promise.resolve(result))};
  return chain;
}
const params=()=>Promise.resolve({organisationId:"org",projectId:"project",reportId:"report"});
function detail(columns?:string[]){return ProjectReportPage({params:params(),searchParams:Promise.resolve({columns})});}

beforeEach(()=>{
  vi.clearAllMocks();reads=[];role="project_admin";vi.stubGlobal("fetch",mocks.fetch);
  mocks.from.mockImplementation(query);
  mocks.requireProject.mockImplementation(async()=>({supabase:{from:mocks.from},access:{role}}));
});
afterEach(()=>{expect(mocks.fetch).not.toHaveBeenCalled();expect(mocks.save).not.toHaveBeenCalled();expect(mocks.generate).not.toHaveBeenCalled();cleanup();vi.unstubAllGlobals();});

describe("saved report mobile identity and accessible tables",()=>{
  it("keeps the full title separate from both logo groups without dropping approved identity",async()=>{
    const {container}=render(await detail());
    const heading=screen.getByRole("heading",{level:1,name:longName});
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(heading.parentElement?.className).toContain(styles.identityTitle);
    expect(heading.parentElement?.parentElement?.className).toContain(styles.identity);
    expect(container.querySelector(`.${styles.clientLogos}`)?.querySelectorAll('[role="img"]')).toHaveLength(3);
    expect(container.querySelector(`.${styles.organisationLogo}`)?.querySelector('[role="img"]')).toBeTruthy();
    expect(screen.getByText("PCR-0007",{selector:"p"})).toBeTruthy();
    expect(screen.getByText(/Client: Operating Client Limited/)).toBeTruthy();
    expect(heading.parentElement?.textContent).toContain("100% at Issued for Design (IFD)");
  });
  it("makes every report table labelled and reachable for native keyboard scrolling",async()=>{
    render(await detail());
    for(const label of ["Discipline performance",`${discipline} issued deliverables`,`${discipline} planned submissions`,"S-curve discipline summary"]){
      const table=screen.getByRole("table",{name:label});
      const region=screen.getByRole("region",{name:`${label} — scroll horizontally`});
      expect(region.getAttribute("tabindex")).toBe("0");expect(region.contains(table)).toBe(true);
      region.focus();expect(document.activeElement).toBe(region);
      for(const header of within(table).getAllByRole("columnheader"))expect(header.getAttribute("scope")).toBe("col");
      for(const header of within(table).getAllByRole("rowheader"))expect(header.getAttribute("scope")).toBe("row");
    }
    expect(screen.getAllByRole("table")).toHaveLength(4);
    expect(screen.getByRole("rowheader",{name:"EL-001 Accepted electrical load list"})).toBeTruthy();
    expect(screen.getByRole("rowheader",{name:"EL-002 Planned cable schedule"})).toBeTruthy();
  });
  it("keeps three client logos compact alongside the organisation logo on narrow screens",async()=>{
    const {container}=render(await detail());
    const groups=[container.querySelector(`.${styles.clientLogos}`)!,container.querySelector(`.${styles.organisationLogo}`)!];
    const tiles=groups.flatMap(group=>Array.from(group.children));
    expect(tiles).toHaveLength(4);
    for(const tile of tiles){
      for(const sizing of ["h-14","w-14","min-w-0","shrink-0","sm:min-w-24","print:min-w-24","print:h-16"])expect(tile.classList.contains(sizing)).toBe(true);
    }
    const css=readFileSync(resolve(process.cwd(),"src/components/project-report-presentation.module.css"),"utf8");
    expect(css).toMatch(/\.identity\s*\{[^}]*grid-template-columns:\s*minmax\(0, 1fr\) auto;/);
    expect(css).toMatch(/\.clientLogos\s*\{[^}]*gap:\s*\.25rem;/);
  });
  it("retains column selections and the exact PDF and restore destinations",async()=>{
    render(await detail(["planned","actual_completion"]));
    expect(screen.getByText("Report column settings",{selector:"summary"}).closest("details")?.open).toBe(false);
    fireEvent.click(screen.getByText("Report column settings",{selector:"summary"}));
    const pdf=new URL(screen.getByRole("link",{name:"Download PDF"}).getAttribute("href")!,"https://engicite.test");
    expect(pdf.pathname).toBe("/api/v1/organisations/org/projects/project/reports/report/pdf");
    expect(pdf.searchParams.getAll("columns")).toEqual(["planned","actual_completion"]);
    expect(screen.getByRole("link",{name:"Restore saved columns"}).getAttribute("href")).toBe(`${base}/reports/report`);
    expect(screen.getByRole("button",{name:"Report column guidance"}).closest("summary")).toBeNull();
    const form=screen.getByRole("button",{name:"Apply columns to this report"}).closest("form")!;
    expect(form.getAttribute("method")).toBe("get");expect(form.getAttribute("action")).toBe(`${base}/reports/report`);
    expect(new FormData(form).getAll("columns")).toEqual(["planned","actual_completion"]);
    expect(within(screen.getByRole("table",{name:"Discipline performance"})).getAllByRole("columnheader")).toHaveLength(3);
    expect(mocks.requireProject).toHaveBeenCalledExactlyOnceWith("org","project");
    expect(reads).toEqual([{table:"project_weekly_reports",filters:[["organisation_id","org"],["project_id","project"],["id","report"]]}]);
  });
  it("uses scoped screen and print rules without clipping tables or squeezing the mobile title",()=>{
    const css=readFileSync(resolve(process.cwd(),"src/components/project-report-presentation.module.css"),"utf8");
    expect(css).toMatch(/\.identityTitle\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*grid-row:\s*1;/);
    expect(css).toMatch(/\.scrollRegion\s*\{[^}]*overflow-x:\s*auto;/);
    expect(css).toMatch(/\.scrollRegion:focus-visible/);
    const print=css.slice(css.indexOf("@media print"));
    expect(print).toMatch(/overflow:\s*visible\s*!important/);
    expect(print).toMatch(/\.scrollRegion table\s*\{[^}]*min-width:\s*0\s*!important/);
    expect(print).toMatch(/\.identityTitle\s*\{[^}]*grid-column:\s*auto;[^}]*grid-row:\s*auto;/);
    expect(print).toMatch(/\.curvePlot\s*\{[^}]*min-width:\s*0/);
  });
});

describe("legacy saved-report S-curve accessibility",()=>{
  it("keeps readable chart geometry, gives it a keyboard scroll region and distinguishes line patterns",()=>{
    render(<ProjectSCurve curve={snapshot.s_curve} totalDeliverables={10} reportPeriodEnd={report.period_end}/>);
    const region=screen.getByRole("region",{name:"Project delivery S-curve — scroll horizontally"});
    const chart=within(region).getByRole("img",{name:"Project S-curve comparing cumulative planned and actual percentage progress against dates"});
    expect(region.getAttribute("tabindex")).toBe("0");expect(chart.getAttribute("viewBox")).toBe("0 0 920 340");
    expect(chart.classList.contains(styles.curvePlot)).toBe(true);
    const traces=chart.querySelectorAll("polyline");
    expect(traces[0].getAttribute("stroke-dasharray")).toBe("6 5");expect(traces[1].hasAttribute("stroke-dasharray")).toBe(false);
    expect(chart.querySelector("desc")?.textContent).toContain("solid navy line");
    expect(screen.getByRole("rowheader",{name:discipline})).toBeTruthy();expect(screen.getAllByText("50%").length).toBeGreaterThan(0);
  });
  it("does not invent a curve before sufficient saved history exists",()=>{
    render(<ProjectSCurve curve={{overall:[],disciplines:[]}} totalDeliverables={10} reportPeriodEnd={report.period_end}/>);
    expect(screen.getByText(/The S-curve will appear after/)).toBeTruthy();expect(screen.queryByRole("img")).toBeNull();expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("report register and unchanged generation controls",()=>{
  it("provides independent manual and scheduled PDF templates defaulted to the saved schedule",()=>{
    render(<ProjectReportControls organisationId="org" projectId="project" weekday={5} enabled lastGeneratedAt={null} pdfColorTemplate="forest"/>);
    const schedule=screen.getByRole("combobox",{name:"Scheduled report colour template"}) as HTMLSelectElement;
    const manual=screen.getByRole("combobox",{name:"Report colour template"}) as HTMLSelectElement;
    expect(schedule.value).toBe("forest");expect(manual.value).toBe("forest");
    fireEvent.change(manual,{target:{value:"slate"}});
    expect(manual.value).toBe("slate");expect(schedule.value).toBe("forest");
    expect(screen.getByText(/Regenerating an existing reporting period keeps its original template/)).toBeTruthy();
  });
  it.each(["project_admin","document_controller","organisation_admin"])("preserves report access and generation affordances for %s",async nextRole=>{
    role=nextRole;render(await ProjectReportsPage({params:params()}));
    expect(screen.getByRole("heading",{name:"Project reports",level:1})).toBeTruthy();
    const link=screen.getByRole("link",{name:/PCR-0007/});expect(link.getAttribute("href")).toBe(`${base}/reports/report`);
    expect(link.className).toContain("grid-cols-2");expect(link.className).toContain("sm:grid-cols-[auto_minmax(0,1fr)_auto_auto_auto]");
    expect(within(link).getByText("50%")).toBeTruthy();expect(within(link).getByText("2")).toBeTruthy();
    const settings=screen.queryByText("Report settings & generation",{selector:"summary"});
    expect(settings!==null).toBe(nextRole==="project_admin");
    if(settings){
      expect(settings.closest("details")?.open).toBe(false);
      expect(Boolean(link.compareDocumentPosition(settings)&Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
      fireEvent.click(settings);
    }
    expect(screen.queryByRole("form",{name:"Weekly report schedule"})!==null).toBe(nextRole==="project_admin");
    expect(screen.queryByRole("form",{name:"Generate current project report"})!==null).toBe(nextRole==="project_admin");
    expect(within(link).getByText("09 Oct 2026 to 16 Oct 2026")).toBeTruthy();
  });
  it("hydrates report controls without replacing server text when host date defaults differ",async()=>{
    const native=Date.prototype.toLocaleString;
    let host="server";
    const locale=vi.spyOn(Date.prototype,"toLocaleString").mockImplementation(function(this:Date,locales,options){
      if(!locales||!options?.timeZone)return `${host} local timestamp`;
      return native.call(this,locales,options);
    });
    const component=<ProjectReportControls organisationId="org" projectId="project" weekday={5} enabled lastGeneratedAt="2026-10-15T23:30:00Z"/>;
    const container=document.createElement("div");
    document.body.append(container);
    const recover=vi.fn();let root:Root|undefined;
    try{
      container.innerHTML=renderToString(component);
      expect(container.textContent).toContain("15 Oct 2026, 23:30 UTC");
      host="browser";
      await act(async()=>{root=hydrateRoot(container,component,{onRecoverableError:recover});});
      expect(recover).not.toHaveBeenCalled();
      expect(container.textContent).toContain("15 Oct 2026, 23:30 UTC");
      expect(locale).not.toHaveBeenCalled();
    }finally{
      if(root)await act(async()=>{root?.unmount();});
      container.remove();locale.mockRestore();
    }
  });
  it("preserves schedule field names, values, hidden scope and generation action inputs",()=>{
    render(<ProjectReportControls organisationId="org" projectId="project" weekday={5} enabled lastGeneratedAt={report.generated_at}/>);
    const form=screen.getByRole("form",{name:"Weekly report schedule"}) as HTMLFormElement;
    expect(screen.getByRole("button",{name:"Weekly report schedule guidance"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Weekly report schedule"})).toBeNull();
    expect(screen.getByRole("combobox",{name:"Generate every"})).toHaveProperty("value","5");
    expect(screen.getByRole("checkbox",{name:"Automatic weekly generation"})).toHaveProperty("checked",true);
    expect(Array.from(new FormData(form))).toEqual([["organisationId","org"],["projectId","project"],["weekday","5"],["pdfColorTemplate","neutral"],["enabled","on"]]);
    const generate=screen.getByRole("form",{name:"Generate current project report"}) as HTMLFormElement;
    expect(Array.from(new FormData(generate))).toEqual([["organisationId","org"],["projectId","project"],["pdfColorTemplate","neutral"]]);
    expect(generate.className).toContain("[--focus:#ffffff]");
    expect(screen.getByRole("button",{name:"Generate a project report"}).closest("form")).toBe(generate);
    expect(form.className).not.toContain("[--focus:#ffffff]");
    expect(screen.getByRole("button",{name:"Generate project report"}).className).toContain("bg-[#b94d20]");
  });
  it("keeps the empty capture state readable without inventing a timestamp",()=>{
    render(<ProjectReportControls organisationId="org" projectId="project" weekday={5} enabled={false} lastGeneratedAt={null}/>);
    expect(screen.getByText(/No report generated yet/)).toBeTruthy();
    expect(screen.getByRole("checkbox",{name:"Automatic weekly generation"})).toHaveProperty("checked",false);
  });
});
