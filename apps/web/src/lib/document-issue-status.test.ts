import { describe, expect, it } from "vitest";
import {
  DOCUMENT_ISSUE_STATUSES,
  DOCUMENT_ISSUE_STATUS_GROUPS,
  DOCUMENT_ISSUE_STATUS_VALUES,
  isDocumentIssueStatus,
} from "@/lib/document-issue-status";

describe("document issue status taxonomy", () => {
  it("contains unique controlled values", () => {
    expect(new Set(DOCUMENT_ISSUE_STATUS_VALUES).size).toBe(DOCUMENT_ISSUE_STATUS_VALUES.length);
  });

  it("places every status in a declared group", () => {
    expect(
      DOCUMENT_ISSUE_STATUSES.every((status) =>
        DOCUMENT_ISSUE_STATUS_GROUPS.includes(status.group),
      ),
    ).toBe(true);
  });

  it("recognises controlled values and rejects arbitrary text", () => {
    expect(isDocumentIssueStatus("Issued for Construction (IFC)")).toBe(true);
    expect(isDocumentIssueStatus("Anything I typed")).toBe(false);
  });
});
