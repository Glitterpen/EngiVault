import {describe,expect,it} from "vitest";
import {
  projectDeliveryStageLabel,
  projectIssueProgressCredit,
  projectTerminalIssueStatus,
} from "./project-delivery-stage";

describe("project delivery stages",()=>{
  it("defines the controlled terminal issue for every project stage",()=>{
    expect(projectTerminalIssueStatus("concept")).toBe("Issued for Approval (IFA)");
    expect(projectTerminalIssueStatus("feed")).toBe("Issued for Design (IFD)");
    expect(projectTerminalIssueStatus("ded")).toBe("Issued for Construction (IFC)");
    expect(projectDeliveryStageLabel("ded")).toContain("DED");
  });

  it("does not award full FEED or DED progress at review or approval",()=>{
    expect(projectIssueProgressCredit("Issued for Review (IFR)","feed")).toBe(33);
    expect(projectIssueProgressCredit("Issued for Approval (IFA)","feed")).toBe(67);
    expect(projectIssueProgressCredit("Issued for Design (IFD)","feed")).toBe(100);
    expect(projectIssueProgressCredit("Issued for Approval (IFA)","ded")).toBe(67);
    expect(projectIssueProgressCredit("Issued for Design (IFD)","ded")).toBe(75);
    expect(projectIssueProgressCredit("Issued for Construction (IFC)","ded")).toBe(100);
  });

  it("allows Concept deliverables to finish at approval",()=>{
    expect(projectIssueProgressCredit("Issued for Review (IFR)","concept")).toBe(50);
    expect(projectIssueProgressCredit("Issued for Approval (IFA)","concept")).toBe(100);
  });
});
