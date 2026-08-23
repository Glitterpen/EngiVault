import {describe,expect,it} from "vitest";
import {mdrAssignmentEmailContent} from "./mdr-assignment-email-content";

const assignment={recipientEmail:"engineer@example.com",recipientName:"A. Engineer",organisationName:"Example Engineering",projectCode:"PRJ-01",projectName:"Export Pipeline FEED",documentNumber:"PRJ-PRO-001",documentTitle:"Process Design Basis",discipline:"Process",plannedSubmissionDate:"2026-09-05",requiredIssueStatus:"Issued for Review (IFR)",documentUrl:"https://engicite.example/app/o/projects/p/documents/d"};

describe("MDR assignment email",()=>{
  it("identifies the organisation, project, deliverable and submission requirement",()=>{
    const content=mdrAssignmentEmailContent(assignment);
    expect(content.subject).toBe("Example Engineering: MDR assignment PRJ-PRO-001");
    expect(content.html).toContain("Export Pipeline FEED");
    expect(content.html).toContain("Process Design Basis");
    expect(content.html).toContain("05 Sept 2026");
    expect(content.html).toContain("Issued for Review (IFR)");
  });

  it("escapes untrusted MDR text before placing it in HTML",()=>{
    const content=mdrAssignmentEmailContent({...assignment,documentTitle:'<script>alert("x")</script>'});
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
  });
});
