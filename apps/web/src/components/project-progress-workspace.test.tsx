import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {ComponentProps} from "react";
import {ProjectProgressWorkspace} from "./project-progress-workspace";
import {buildProjectDeliveryCurve,type DeliveryCurveModel} from "@/lib/project-delivery-curve";
import type {ProgressDeliveryRow} from "@/lib/project-progress-data";

const captures=vi.hoisted(()=>({curve:vi.fn(),refresh:vi.fn(),schedule:vi.fn()}));
vi.mock("@/components/project-delivery-curve",()=>({ProjectDeliveryCurve:({curve}:{curve:DeliveryCurveModel})=>{captures.curve(curve);return <section aria-label="Delivery curve fixture"/>;}}));
vi.mock("@/components/project-progress-refresh",()=>({ProjectProgressRefresh:({asOf}:{asOf:string})=>{captures.refresh(asOf);return <p data-testid="refresh-as-of">{asOf}</p>;}}));
vi.mock("@/components/document-issue-schedule",()=>({DocumentIssueSchedule:({schedule}:{schedule:ProgressDeliveryRow})=>{captures.schedule(schedule);return <p>Schedule for {schedule.document_number}</p>;}}));
beforeEach(()=>{vi.clearAllMocks();});
afterEach(cleanup);

type Props=ComponentProps<typeof ProjectProgressWorkspace>;
const asOf="2026-10-15T12:00:00Z";
const project={code:"PRJ-100",name:"Terminal upgrade",delivery_stage:"feed" as const,planned_start_date:"2026-10-01",planned_end_date:"2026-12-31"};
function row(id:string,overrides:Partial<ProgressDeliveryRow>={}):ProgressDeliveryRow{return {document_id:id,document_number:`DOC-${id}`,title:`Deliverable ${id}`,discipline:"Electrical",progress_weight:1,progress_credit:0,uploaded:false,overdue:false,issue_status:null,planned_submission_date:"2026-10-01",planned_final_date:"2026-12-31",next_submission_date:"2026-10-20",last_issue_date:null,revision_cycle_days:3,deadline_kind:"first_issue",...overrides};}
const rows=[row("1",{progress_credit:100,uploaded:true,issue_status:"Issued for Design (IFD)"}),row("2",{progress_weight:3,progress_credit:20,uploaded:true,overdue:true,issue_status:"Issued for Interdiscipline Check (IDC)"}),row("3",{discipline:"Process",progress_weight:2}),row("4",{discipline:"Process",progress_weight:2,uploaded:true})];
function workspace(overrides:Partial<Props>={}){
  const data={organisationId:"org-A",projectId:"project-A",project,rows,issues:[],curve:buildProjectDeliveryCurve({documents:rows,submissionProgress:{version:1,captured_at:asOf,submitted_progress:60,accepted_progress:20,total_deliverables:4,total_weight:8},reports:[],asOf,plannedStart:project.planned_start_date,plannedEnd:project.planned_end_date,historyAvailable:true}),asOf,role:"project_admin",includeHistory:true,...overrides};
  return {...render(<ProjectProgressWorkspace {...data}/>),props:data};
}
function summary(){return screen.getByRole("region",{name:"Delivery summary"});}
function datum(label:string){return within(summary()).getByText(label,{exact:true}).nextElementSibling!;}
function details(){return screen.getByText("Deliverable details",{exact:false}).closest("details")!;}
function openDetails(){const element=details();fireEvent.click(element.querySelector("summary")!);return element;}
function results(){return screen.getByRole("region",{name:"Deliverable progress results"});}
function search(value:string){fireEvent.change(screen.getByRole("searchbox",{name:"Search deliverables"}),{target:{value}});}

describe("compact progress and health summary",()=>{
  it("uses real weighted progress/health and preserves upload, accepted-stage and terminal scope counts",()=>{
    const result=workspace();
    expect(screen.getByRole("heading",{level:1,name:"Progress & health"})).toBeTruthy();
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(screen.getByText("PRJ-100 · Terminal upgrade")).toBeTruthy();
    expect(datum("Project health").textContent).toBe("Needs attention");
    expect(datum("DCC-accepted progress").textContent).toBe("20%");
    expect(datum("Overall submitted").textContent).toBe("60%");
    expect(datum("MDR deliverables").textContent).toBe("4");
    expect(datum("Overdue").textContent).toBe("1");
    expect(summary().textContent).toContain("3 files uploaded");
    expect(summary().textContent).toContain("2 stage accepted");
    expect(summary().textContent).toContain("1 / 4 terminal-stage issued");
    expect(captures.curve).toHaveBeenCalledExactlyOnceWith(result.props.curve);
    expect(captures.refresh).toHaveBeenCalledExactlyOnceWith(asOf);
    expect(screen.getByTestId("refresh-as-of").textContent).toBe(asOf);
  });
  it.each([["critical","At risk"],["high","Needs attention"],["low","Complete"]])("includes unresolved %s issues in project health",(severity,health)=>{
    workspace({rows:[row("one",{progress_credit:100})],issues:[{id:"issue",severity,status:"open"}]});
    expect(datum("Project health").textContent).toBe(health);
  });
  it("does not call unavailable issue health healthy while preserving known delivery figures",()=>{
    workspace({rows:[row("one",{progress_credit:100,uploaded:true})],issues:null});
    expect(screen.getByRole("alert").textContent).toContain("Issue health could not be loaded");
    expect(datum("Project health").textContent).toBe("Unavailable");
    expect(datum("DCC-accepted progress").textContent).toBe("100%");
    expect(datum("MDR deliverables").textContent).toBe("1");
    expect(within(summary()).queryByText("On track")).toBeNull();
    expect(within(summary()).queryByText("Complete")).toBeNull();
    expect(within(summary()).queryByText("Setup required")).toBeNull();
  });
  it("keeps zero scope honest without hiding the real empty-state reason",()=>{
    workspace({rows:[]});
    expect(datum("Project health").textContent).toBe("Setup required");
    expect(datum("DCC-accepted progress").textContent).toBe("0%");
    expect(datum("MDR deliverables").textContent).toBe("0");
    expect(screen.getByText("No active MDR deliverables are available in your scope.")).toBeTruthy();
    expect(screen.queryByRole("progressbar")).toBeNull();
  });
  it("aggregates each discipline separately and exposes its weighted percentage through a named progressbar",()=>{
    workspace();
    const electrical=screen.getByRole("progressbar",{name:"Electrical DCC-accepted progress"});
    const process=screen.getByRole("progressbar",{name:"Process DCC-accepted progress"});
    expect(electrical.getAttribute("aria-valuemin")).toBe("0");expect(electrical.getAttribute("aria-valuemax")).toBe("100");
    expect(electrical.getAttribute("aria-valuenow")).toBe("40");expect(process.getAttribute("aria-valuenow")).toBe("0");
    expect(electrical.querySelector("div")?.style.width).toBe("40%");
    expect(screen.getByText("2 deliverables · 1 terminal issued · 1 overdue")).toBeTruthy();
    expect(screen.getByText("2 deliverables · 0 terminal issued")).toBeTruthy();
  });
  it("shows unavailable rather than zero when submitted progress cannot be read",()=>{
    workspace({curve:buildProjectDeliveryCurve({documents:rows,submissionProgress:null,reports:[],asOf,plannedStart:project.planned_start_date,plannedEnd:project.planned_end_date,historyAvailable:true})});
    expect(datum("Overall submitted").textContent).toBe("Unavailable");expect(datum("DCC-accepted progress").textContent).toBe("20%");
  });
  it("keeps FEED terminal milestone explanation behind keyboard-accessible help",()=>{
    workspace();
    expect(screen.queryByRole("tooltip")).toBeNull();
    const help=screen.getByRole("button",{name:"Stage-weighted progress"});
    expect(help.hasAttribute("data-preview-safe")).toBe(true);
    fireEvent.focus(help);
    expect(screen.getByRole("tooltip").textContent).toContain("FEED");
    expect(screen.getByRole("tooltip").textContent).toContain("Issued for Design (IFD)");
    expect(screen.getByRole("tooltip").textContent).toContain("weighted by DCC-accepted milestones, not uploaded file counts");
  });
});

describe("authorised scope and navigation",()=>{
  it.each(["organisation_admin","project_admin","executive_viewer","unknown"])("keeps %s document summaries readable without dead-end operational links",role=>{
    workspace({role});openDetails();
    expect(within(results()).queryByRole("link")).toBeNull();
    expect(within(results()).getByText("DOC-1")).toBeTruthy();
    expect(within(results()).getByText("Deliverable 1")).toBeTruthy();
    expect(captures.schedule.mock.calls.map(([schedule])=>schedule.document_id)).toContain("1");
    search("DOC-1");
    expect(within(results()).getAllByRole("listitem")).toHaveLength(1);
  });
  it.each(["document_controller","engineer","viewer"])("preserves the authorised operational document destination for %s",role=>{
    workspace({role});openDetails();
    expect(within(results()).getByRole("link",{name:"DOC-1"}).getAttribute("href")).toBe("/app/org-A/projects/project-A/documents/1");
  });
  it.each([["organisation_admin","overview"],["project_admin","overview"],["document_controller","control"]])("keeps history/report navigation scoped for %s",(role,destination)=>{
    workspace({role,includeHistory:true});
    expect(screen.getByRole("link",{name:"Role workspace"}).getAttribute("href")).toBe(`/app/org-A/projects/project-A/${destination}`);
    expect(screen.getByRole("link",{name:"Project reports"}).getAttribute("href")).toBe("/app/org-A/projects/project-A/reports");
    expect(screen.queryByText(/This view covers your authorised deliverables only/)).toBeNull();
  });
  it.each([["engineer","assignments"],["viewer","documents"]])("does not offer project-wide report history when scoped to %s",(role,destination)=>{
    workspace({role,includeHistory:false});
    expect(screen.queryByRole("link",{name:"Project reports"})).toBeNull();
    expect(screen.getByText("This view covers your authorised deliverables only. Project-wide report history is not included.")).toBeTruthy();
    expect(screen.getByRole("link",{name:"Role workspace"}).getAttribute("href")).toBe(`/app/org-A/projects/project-A/${destination}`);
  });
  it("does not render write forms or mutation actions and marks individual read controls preview-safe",()=>{
    const {container}=workspace({rows:Array.from({length:13},(_,index)=>row(String(index+1)))});
    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(details().hasAttribute("data-preview-safe")).toBe(false);
    openDetails();
    const searchbox=screen.getByRole("searchbox",{name:"Search deliverables"});
    expect(searchbox.hasAttribute("data-preview-safe")).toBe(true);
    expect(searchbox.getAttribute("aria-controls")).toBe(results().id);
    for(const name of ["Previous","Next"]){
      const button=screen.getByRole("button",{name});
      expect(button.getAttribute("type")).toBe("button");expect(button.hasAttribute("data-preview-safe")).toBe(true);
      expect(button.parentElement?.closest("[data-preview-safe]")).toBeNull();
    }
    expect(screen.queryByRole("button",{name:/Approve|Assign|Delete|Save/})).toBeNull();
  });
});

describe("collapsed searchable deliverable details",()=>{
  it("starts collapsed and retains scoped document links, issue purposes and actual schedule rows",()=>{
    workspace({role:"document_controller"});
    expect((details() as HTMLDetailsElement).open).toBe(false);
    openDetails();
    expect((details() as HTMLDetailsElement).open).toBe(true);
    expect(within(results()).getByRole("link",{name:"DOC-1"}).getAttribute("href")).toBe("/app/org-A/projects/project-A/documents/1");
    expect(within(results()).getByText("Electrical · Issued for Design (IFD)")).toBeTruthy();
    expect(within(results()).getAllByText("Process · No accepted revision")).toHaveLength(2);
    expect(captures.schedule.mock.calls.map(([schedule])=>schedule.document_id)).toEqual(expect.arrayContaining(rows.map(row=>row.document_id)));
    expect(within(results()).getByText("100% earned")).toBeTruthy();
  });
  it("paginates 25 rows into 12, 12 and 1 with natural document ordering and focus on the results region",()=>{
    workspace({role:"document_controller",rows:Array.from({length:25},(_,index)=>row(String(25-index)))});
    openDetails();
    expect(within(results()).getAllByRole("listitem")).toHaveLength(12);
    expect(within(results()).getByRole("link",{name:"DOC-1"})).toBeTruthy();
    expect(within(results()).getByRole("link",{name:"DOC-12"})).toBeTruthy();
    expect(within(results()).queryByRole("link",{name:"DOC-13"})).toBeNull();
    expect((screen.getByRole("button",{name:"Previous"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    expect(document.activeElement).toBe(results());
    expect(within(results()).getAllByRole("listitem")).toHaveLength(12);
    expect(within(results()).getByRole("link",{name:"DOC-13"})).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("25 matching deliverables · Page 2 of 3");
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    expect(within(results()).getAllByRole("listitem")).toHaveLength(1);
    expect(within(results()).getByRole("link",{name:"DOC-25"})).toBeTruthy();
    expect((screen.getByRole("button",{name:"Next"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("searches every authorised row including unopened pages by number, title, discipline and issue purpose",()=>{
    const data=Array.from({length:25},(_,index)=>row(String(index+1),index===24?{title:"Special compressor layout",discipline:"Mechanical",issue_status:"Issued for Approval (IFA)"}:{}));
    workspace({role:"document_controller",rows:data});openDetails();
    for(const query of [" doc-25 ","COMPRESSOR","mechanical","issued for approval"]){
      search(query);
      expect(within(results()).getAllByRole("listitem")).toHaveLength(1);
      expect(within(results()).getByRole("link",{name:"DOC-25"})).toBeTruthy();
      expect(screen.getByRole("status").textContent).toBe("1 matching deliverables · Page 1 of 1");
    }
    search("unknown deliverable");
    expect(within(results()).getByText("No matching deliverables.")).toBeTruthy();
    expect(within(results()).queryByRole("link")).toBeNull();
    search("");
    expect(within(results()).getAllByRole("listitem")).toHaveLength(12);
    expect(screen.getByRole("status").textContent).toBe("25 matching deliverables · Page 1 of 3");
  });
  it("resets paging after search and moves Previous immediately after refreshed rows clamp a stale page",()=>{
    const data=Array.from({length:25},(_,index)=>row(String(index+1)));
    const {rerender,props}=workspace({role:"document_controller",rows:data});openDetails();
    fireEvent.click(screen.getByRole("button",{name:"Next"}));
    search("DOC-25");
    expect(within(results()).getByRole("link",{name:"DOC-25"})).toBeTruthy();
    expect(screen.queryByRole("navigation",{name:"Deliverable pages"})).toBeNull();
    search("");
    expect(screen.getByRole("status").textContent).toContain("Page 1 of 3");
    fireEvent.click(screen.getByRole("button",{name:"Next"}));fireEvent.click(screen.getByRole("button",{name:"Next"}));
    rerender(<ProjectProgressWorkspace {...props} rows={data.slice(0,13)}/>);
    expect(screen.getByRole("status").textContent).toBe("13 matching deliverables · Page 2 of 2");
    expect(within(results()).getAllByRole("listitem")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button",{name:"Previous"}));
    expect(screen.getByRole("status").textContent).toBe("13 matching deliverables · Page 1 of 2");
    expect(within(results()).getAllByRole("listitem")).toHaveLength(12);
    expect(document.activeElement).toBe(results());
  });
});
