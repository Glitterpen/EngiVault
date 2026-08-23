import { describe, expect, it } from "vitest";
import {
  blockedIssueStatuses,
  isIssueSequenceAvailable,
  ISSUE_FOR_APPROVAL,
  ISSUE_FOR_CONSTRUCTION,
  ISSUE_FOR_DESIGN,
  ISSUE_FOR_REVIEW,
  requiredIssuePredecessor,
} from "./document-issue-sequence";

describe("controlled document issue sequence", () => {
  it("requires IFR before IFA", () => {
    expect(requiredIssuePredecessor(ISSUE_FOR_APPROVAL)).toBe(ISSUE_FOR_REVIEW);
    expect(isIssueSequenceAvailable(ISSUE_FOR_APPROVAL, [])).toBe(false);
    expect(isIssueSequenceAvailable(ISSUE_FOR_APPROVAL, [ISSUE_FOR_REVIEW])).toBe(true);
  });

  it("requires IFA before either terminal design issue", () => {
    expect(requiredIssuePredecessor(ISSUE_FOR_DESIGN)).toBe(ISSUE_FOR_APPROVAL);
    expect(requiredIssuePredecessor(ISSUE_FOR_CONSTRUCTION)).toBe(ISSUE_FOR_APPROVAL);
    expect(isIssueSequenceAvailable(ISSUE_FOR_DESIGN, [ISSUE_FOR_REVIEW])).toBe(false);
    expect(isIssueSequenceAvailable(ISSUE_FOR_CONSTRUCTION, [ISSUE_FOR_APPROVAL])).toBe(true);
  });

  it("does not restrict other issue purposes", () => {
    expect(isIssueSequenceAvailable("Issued for Information (IFI)", [])).toBe(true);
  });

  it("reports every unavailable controlled stage", () => {
    expect(blockedIssueStatuses([])).toEqual([
      ISSUE_FOR_APPROVAL,
      ISSUE_FOR_DESIGN,
      ISSUE_FOR_CONSTRUCTION,
    ]);
    expect(blockedIssueStatuses([ISSUE_FOR_REVIEW])).toEqual([
      ISSUE_FOR_DESIGN,
      ISSUE_FOR_CONSTRUCTION,
    ]);
    expect(blockedIssueStatuses([ISSUE_FOR_REVIEW, ISSUE_FOR_APPROVAL])).toEqual([]);
  });
});
