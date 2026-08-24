import {describe,expect,it} from "vitest";
import {disciplineAssignmentEmailContent} from "./discipline-assignment-email-content";

const assignment={recipientEmail:"engineer@example.com",recipientName:"M. Engineer",organisationName:"Example Engineering",projectCode:"PRJ-01",projectName:"Export Pipeline FEED",discipline:"Mechanical",totalDocuments:12,newAssignments:9,assignmentsUrl:"https://engicite.example/app/o/projects/p/assignments"};

describe("discipline MDR assignment email",()=>{
  it("summarises the consolidated discipline assignment",()=>{
    const content=disciplineAssignmentEmailContent(assignment);
    expect(content.subject).toBe("Example Engineering: Mechanical MDR deliverables assigned");
    expect(content.html).toContain("Export Pipeline FEED");
    expect(content.html).toContain("New assignments:</strong> 9");
    expect(content.html).toContain("Total active discipline deliverables:</strong> 12");
  });

  it("escapes untrusted tenant and discipline text",()=>{
    const content=disciplineAssignmentEmailContent({...assignment,organisationName:'Unsafe\nOrg',discipline:'<script>alert("x")</script>'});
    expect(content.subject).not.toContain("\n");
    expect(content.html).not.toContain("<script>");
    expect(content.html).toContain("&lt;script&gt;");
  });
});
