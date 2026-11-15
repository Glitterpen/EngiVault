import {cleanup,render,screen,within} from "@testing-library/react";
import {afterEach,describe,expect,it} from "vitest";
import type {ComponentProps} from "react";
import {DccControlWorkspace} from "./dcc-control-workspace";

afterEach(cleanup);
type Props=ComponentProps<typeof DccControlWorkspace>;
function workspace(overrides:Partial<Props>={}){
  return render(<DccControlWorkspace organisationId="org" projectId="project" project={{code:"FEED-001",name:"Full engineering project name",project_introduction:null,key_objectives:null,planned_start_date:null,planned_end_date:null}} summary={{deliverables:10,awaitingReview:2,pendingRequests:8,unsubmitted:3,overdue:1,engineers:4,issues:0}} disciplines={[{name:"Process",count:10}]} preview={false} issueForm={<button type="button">Report issue</button>} {...overrides}/>);
}

describe("compact document control heading and unchanged workflows",()=>{
  it("keeps the functional page title and full exact project identity visible before disclosures",()=>{
    workspace();
    expect(screen.getByRole("heading",{level:1,name:"Document control centre"})).toBeTruthy();
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(screen.getByText("FEED-001 · Full engineering project name").closest("details")).toBeNull();
    expect(screen.queryByRole("button",{name:"Document Control workspace"})).toBeNull();
    expect(screen.getByRole("button",{name:"Register counts"})).toBeTruthy();
  });
  it("preserves all scoped task and reference destinations with a single primary MDR action",()=>{
    workspace();
    expect(screen.getAllByRole("link",{name:"Open MDR"})).toHaveLength(1);
    for(const [name,path] of [["Open MDR","/documents"],["Review submissions","/reviews"],["Deliverable requests","/requests"],["Create transmittal","/work-packages/transmittals/new"],["Work packages","/work-packages"],["Project templates","/templates"]]){
      expect(screen.getByRole("link",{name:new RegExp(`^${name}(?:\\b|$)`)}).getAttribute("href")).toBe(`/app/org/projects/project${path}`);
    }
  });
  it("shows the full brief, objectives, and dates without expanding anything",()=>{
    const introduction="Prepare the project deliverables.\n\nCoordinate all discipline interfaces before issue.";
    const objective="Review interface "+"unbrokentrackingnumber".repeat(12);
    workspace({project:{code:"FEED-001",name:"Full engineering project name",project_introduction:introduction,key_objectives:["Complete the MDR",objective],planned_start_date:"2026-09-07",planned_end_date:"2026-10-09"}});
    const brief=screen.getByRole("region",{name:"Project brief and dates"});
    const queue=screen.getByRole("region",{name:"Work queue"});
    expect(brief.closest("details")).toBeNull();
    expect(queue.closest("details")).toBeNull();
    expect(brief.compareDocumentPosition(queue)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(brief).getByText(introduction,{normalizer:value=>value}).textContent).toBe(introduction);
    expect(within(brief).getAllByRole("listitem").map(item=>item.textContent)).toEqual(["Complete the MDR",objective]);
    expect(within(brief).getByText("07 Sept 2026",{selector:"time"}).getAttribute("datetime")).toBe("2026-09-07");
    expect(within(brief).getByText("09 Oct 2026",{selector:"time"}).getAttribute("datetime")).toBe("2026-10-09");
    expect(within(brief).getByRole("link",{name:"Jump to work queue"}).getAttribute("href")).toBe(`#${queue.id}`);
    expect(queue.getAttribute("tabindex")).toBe("-1");
  });
  it("shows each unplanned date independently and does not invent brief content",()=>{
    workspace({project:{code:"FEED-001",name:"Full engineering project name",project_introduction:" ",key_objectives:[" "],planned_start_date:"2026-02-30",planned_end_date:"2026-10-09"}});
    const brief=screen.getByRole("region",{name:"Project brief and dates"});
    expect(within(brief).getByText("Planned start").nextElementSibling?.textContent).toBe("Not planned");
    expect(within(brief).getByText("Planned completion").nextElementSibling?.textContent).toBe("09 Oct 2026");
    expect(within(brief).getByText("No project introduction has been recorded.")).toBeTruthy();
    expect(within(brief).queryByRole("heading",{name:"Key objectives"})).toBeNull();
  });
  it("preserves the read-only preview boundary and collapsed supplementary sections",()=>{
    const {container}=workspace({preview:true});
    expect(screen.queryByRole("button",{name:"Report issue",hidden:true})).toBeNull();
    expect(screen.getByText("Issue reporting is unavailable in this read-only preview.")).toBeTruthy();
    expect([...container.querySelectorAll("details")].every(disclosure=>!disclosure.open)).toBe(true);
    expect(screen.getByRole("link",{name:"Open MDR"})).toBeTruthy();
    expect(screen.getByRole("link",{name:/^Review submissions 2 awaiting review/})).toBeTruthy();
    expect(screen.getByRole("link",{name:/^Deliverable requests 8 awaiting DCC acceptance/})).toBeTruthy();
  });
  it("distinguishes genuine empty queues from an unavailable request count",()=>{
    workspace({summary:{deliverables:0,awaitingReview:0,pendingRequests:null,unsubmitted:0,overdue:0,engineers:0,issues:0}});
    expect(screen.getByRole("link",{name:/^Review submissions 0 awaiting review/})).toBeTruthy();
    expect(screen.getByRole("link",{name:/^Deliverable requests Count unavailable/})).toBeTruthy();
    expect(screen.queryByText("0 awaiting DCC acceptance")).toBeNull();
  });
  it("opens a named MDR folder without sending obsolete discipline filters",()=>{
    const {container}=workspace({disciplines:[{name:"Electrical & Instrumentation",count:4},{name:"Process",count:6}]});
    const disclosure=[...container.querySelectorAll("details")].find(element=>element.querySelector("summary")?.textContent?.startsWith("MDR by discipline"))!;
    disclosure.open=true;
    for(const name of ["Electrical & Instrumentation","Process"]){
      const link=screen.getByRole("link",{name:new RegExp(`^${name}`)});
      const target=new URL(link.getAttribute("href")!,"https://engicite.test");
      expect(target.pathname).toBe("/app/org/projects/project/documents");
      expect(Object.fromEntries(target.searchParams)).toEqual({folder:name});
    }
  });
});
