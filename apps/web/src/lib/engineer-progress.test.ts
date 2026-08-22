import { describe, expect, it } from "vitest";
import { engineerProgressHealth, recoverableProjectImpact } from "./engineer-progress";

describe("engineer project progress", () => {
  it("does not claim an engineer is on track before MDR scope is assigned", () => {
    expect(engineerProgressHealth({ variancePoints: 0, overdueCount: 0, returnedCount: 0, dueSoonCount: 0, deliverableCount: 0 })).toBe("no_scope");
  });

  it("flags overdue, returned, and negative variance work as lagging", () => {
    expect(engineerProgressHealth({ variancePoints: -5, overdueCount: 0, returnedCount: 0, dueSoonCount: 0 })).toBe("lagging");
    expect(engineerProgressHealth({ variancePoints: 0, overdueCount: 1, returnedCount: 0, dueSoonCount: 0 })).toBe("lagging");
    expect(engineerProgressHealth({ variancePoints: 0, overdueCount: 0, returnedCount: 1, dueSoonCount: 0 })).toBe("lagging");
  });

  it("uses upcoming deadlines as an at-risk warning", () => {
    expect(engineerProgressHealth({ variancePoints: 3, overdueCount: 0, returnedCount: 0, dueSoonCount: 2 })).toBe("at_risk");
    expect(engineerProgressHealth({ variancePoints: 3, overdueCount: 0, returnedCount: 0, dueSoonCount: 0 })).toBe("on_track");
  });

  it("calculates the project percentage points recoverable from a deliverable", () => {
    expect(recoverableProjectImpact(2, 50, 20)).toBe(5);
    expect(recoverableProjectImpact(1, 100, 20)).toBe(0);
    expect(recoverableProjectImpact(1, 0, 0)).toBe(0);
  });
});
