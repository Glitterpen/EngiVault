import { describe, expect, it } from "vitest";
import { activeProjectResourcePlans } from "./project-resource-readiness";

const mechanical = { id: "mechanical", discipline: "Mechanical", required_count: 3, notes: "Retained plan" };
const process = { id: "process", discipline: "Process", required_count: 2, notes: null };
const category = (name: string, kind = "discipline") => ({ name, kind, code: "" });

describe("active project resource plans", () => {
  it("excludes removed disciplines without deleting or changing their saved plans", () => {
    const plans = Object.freeze([Object.freeze(mechanical), Object.freeze(process)]);
    expect(activeProjectResourcePlans(plans, [category("Process")])).toEqual([process]);
    expect(plans).toEqual([mechanical, process]);
  });

  it("includes a restored discipline's existing plan again", () => {
    expect(activeProjectResourcePlans([mechanical, process], [category("Mechanical"), category("Process")]))
      .toEqual([mechanical, process]);
  });

  it("matches whitespace and case without merging distinct punctuation", () => {
    const plans = [
      { discipline: "  ROTATING   equipment " },
      { discipline: "E&I" },
      { discipline: "E I" },
    ];
    expect(activeProjectResourcePlans(plans, [category("Rotating Equipment"), category("E&I")]))
      .toEqual(plans.slice(0, 2));
  });

  it("never treats a document type or another category's code as an active discipline", () => {
    expect(activeProjectResourcePlans([mechanical], [category("Mechanical", "document_type"),
      { ...category("Process"), code: "Mechanical" }])).toEqual([]);
  });

  it("returns no readiness plans when all disciplines have been removed", () => {
    expect(activeProjectResourcePlans([mechanical, process], [])).toEqual([]);
  });
});
