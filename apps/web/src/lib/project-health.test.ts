import {describe,expect,it} from "vitest";
import {assessProjectHealth} from "./project-health";

describe("project health",()=>{
  it("flags critical issues and material delivery lag",()=>{
    expect(assessProjectHealth({deliverables:10,completion:30,overdue:0,highIssues:0,criticalIssues:1})).toBe("At risk");
    expect(assessProjectHealth({deliverables:10,completion:30,overdue:3,highIssues:0,criticalIssues:0})).toBe("At risk");
  });
  it("shows attention for isolated overdue work or high issues",()=>{
    expect(assessProjectHealth({deliverables:10,completion:70,overdue:1,highIssues:0,criticalIssues:0})).toBe("Needs attention");
    expect(assessProjectHealth({deliverables:10,completion:70,overdue:0,highIssues:1,criticalIssues:0})).toBe("Needs attention");
  });
  it("distinguishes setup, healthy delivery and completion",()=>{
    expect(assessProjectHealth({deliverables:0,completion:0,overdue:0,highIssues:0,criticalIssues:0})).toBe("Setup required");
    expect(assessProjectHealth({deliverables:5,completion:45,overdue:0,highIssues:0,criticalIssues:0})).toBe("On track");
    expect(assessProjectHealth({deliverables:5,completion:100,overdue:0,highIssues:0,criticalIssues:0})).toBe("Complete");
  });
});
