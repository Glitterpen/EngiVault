import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it} from "vitest";
import {DocumentIssueSchedule} from "./document-issue-schedule";
import type {DocumentSchedule} from "@/lib/document-schedule";
afterEach(cleanup);
const schedule:DocumentSchedule={document_id:"doc",planned_submission_date:"2026-09-01",last_issue_date:"2026-09-04",next_submission_date:"2026-09-09",revision_cycle_days:3,deadline_kind:"next_revision",overdue:true};
describe("MDR issue schedule",()=>{
  it("shows the approved date alongside the unchanged first-issue baseline",()=>{
    render(<DocumentIssueSchedule schedule={{...schedule,deadline_kind:"approved_change",overdue:false}}/>);
    expect(screen.getByText("Approved submission date: 09 Sept 2026")).toBeTruthy();
    expect(screen.getByText("First issue: 01 Sept 2026")).toBeTruthy();
  });
  it("distinguishes the unchanged first issue from the next working-day deadline",()=>{
    render(<DocumentIssueSchedule schedule={schedule}/>);
    expect(screen.getByText("First issue: 01 Sept 2026")).toBeTruthy();
    expect(screen.getByText("Next issue due: 09 Sept 2026")).toBeTruthy();
    expect(screen.getByText("Cycle: 3 working days")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
  });
  it("does not invent a next date for a terminal submission",()=>{
    render(<DocumentIssueSchedule schedule={{...schedule,next_submission_date:null,deadline_kind:"terminal_received",overdue:false}}/>);
    expect(screen.getByText(/Terminal issue received/)).toBeTruthy();
    expect(screen.queryByText(/Next issue due/)).toBeNull();expect(screen.queryByText("Overdue")).toBeNull();
  });
  it("asks for PM configuration on existing projects without a cycle",()=>{
    render(<DocumentIssueSchedule schedule={{...schedule,next_submission_date:null,revision_cycle_days:null,deadline_kind:"cycle_not_set",overdue:false}}/>);
    expect(screen.getByText("Project Manager to set revision cycle")).toBeTruthy();
  });
});
