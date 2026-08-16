import {describe,expect,it} from "vitest";
import {hasReceivedSubmission,isSubmissionOverdue} from "./submission-deadlines";

describe("MDR submission deadlines",()=>{
  it("marks a past due document overdue when no file was received",()=>{
    expect(isSubmissionOverdue("2026-08-01",[],"2026-08-07")).toBe(true);
  });

  it("does not count an abandoned pending upload as received",()=>{
    expect(hasReceivedSubmission(["pending_upload"])).toBe(false);
    expect(isSubmissionOverdue("2026-08-01",["pending_upload"],"2026-08-07")).toBe(true);
  });

  it("stops overdue reminders after the completed upload reaches secure processing",()=>{
    expect(isSubmissionOverdue("2026-08-01",["quarantined"],"2026-08-07")).toBe(false);
    expect(isSubmissionOverdue("2026-08-01",["ready"],"2026-08-07")).toBe(false);
  });

  it("does not alert before the agreed submission date has passed",()=>{
    expect(isSubmissionOverdue("2026-08-08",[],"2026-08-07")).toBe(false);
  });
});
