import { describe, expect, it } from "vitest";
import { engineerDeliverableState, requiresEngineerAction } from "./engineer-deliverables";

const today = new Date("2026-08-08T12:00:00Z");

describe("engineer deliverable status", () => {
  it("prioritises the latest DCC control decision", () => {
    expect(engineerDeliverableState({plannedSubmissionDate:"2026-08-01",controlStatus:"accepted"},today)).toBe("accepted");
    expect(engineerDeliverableState({plannedSubmissionDate:"2026-08-01",controlStatus:"submitted"},today)).toBe("in_review");
    expect(engineerDeliverableState({plannedSubmissionDate:"2026-08-20",controlStatus:"returned"},today)).toBe("returned");
  });

  it("identifies unsent overdue and near-due work", () => {
    expect(engineerDeliverableState({plannedSubmissionDate:"2026-08-07",controlStatus:null},today)).toBe("overdue");
    expect(engineerDeliverableState({plannedSubmissionDate:"2026-08-12",controlStatus:null},today)).toBe("due_soon");
    expect(engineerDeliverableState({plannedSubmissionDate:"2026-09-01",controlStatus:null},today)).toBe("not_submitted");
  });

  it("treats returned, overdue, upcoming and unsubmitted work as actionable", () => {
    expect(requiresEngineerAction("returned")).toBe(true);
    expect(requiresEngineerAction("overdue")).toBe(true);
    expect(requiresEngineerAction("due_soon")).toBe(true);
    expect(requiresEngineerAction("not_submitted")).toBe(true);
    expect(requiresEngineerAction("in_review")).toBe(false);
    expect(requiresEngineerAction("accepted")).toBe(false);
  });
});
