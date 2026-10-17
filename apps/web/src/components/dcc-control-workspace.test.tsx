import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it} from "vitest";
import type {ComponentProps} from "react";
import {DccControlWorkspace} from "./dcc-control-workspace";

afterEach(cleanup);
type Props=ComponentProps<typeof DccControlWorkspace>;
function workspace(overrides:Partial<Props>={}){
  return render(<DccControlWorkspace organisationId="org" projectId="project" project={{code:"FEED-001",name:"Full engineering project name",project_introduction:null,key_objectives:null,planned_end_date:null}} summary={{deliverables:10,awaitingReview:2,pendingRequests:8,unsubmitted:3,overdue:1,engineers:4,issues:0}} disciplines={[{name:"Process",count:10}]} preview={false} issueForm={<button type="button">Report issue</button>} {...overrides}/>);
}

describe("compact document control heading and unchanged workflows",()=>{
  it("keeps the functional page title and full exact project identity visible before disclosures",()=>{
    workspace();
    expect(screen.getByRole("heading",{level:1,name:"Document control centre"})).toBeTruthy();
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(screen.getByText("FEED-001 · Full engineering project name").closest("details")).toBeNull();
    expect(screen.getByRole("button",{name:"Document Control workspace"})).toBeTruthy();
  });
  it("preserves all scoped task and reference destinations with a single primary MDR action",()=>{
    workspace();
    expect(screen.getAllByRole("link",{name:"Open MDR"})).toHaveLength(1);
    for(const [name,path] of [["Open MDR","/documents"],["Review submissions","/reviews"],["Deliverable requests","/requests"],["Create transmittal","/work-packages/transmittals/new"],["Work packages","/work-packages"],["Project templates","/templates"]]){
      expect(screen.getByRole("link",{name:new RegExp(`^${name}(?:\\b|$)`)}).getAttribute("href")).toBe(`/app/org/projects/project${path}`);
    }
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
