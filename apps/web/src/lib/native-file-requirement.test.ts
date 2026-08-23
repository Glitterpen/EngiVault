import { describe, expect, it } from "vitest";
import { requiresNativeCompanion } from "./native-file-requirement";

describe("native engineering source requirements", () => {
  it("requires an editable source for a FEED IFD PDF", () => {
    expect(requiresNativeCompanion("feed", "Issued for Design (IFD)", "design.pdf")).toBe(true);
  });

  it("requires an editable source for a DED IFC PDF", () => {
    expect(requiresNativeCompanion("ded", "Issued for Construction (IFC)", "drawing.PDF")).toBe(true);
  });

  it("does not require a companion before the terminal issue", () => {
    expect(requiresNativeCompanion("feed", "Issued for Review (IFR)", "design.pdf")).toBe(false);
  });

  it("does not require a second file when the primary file is already native", () => {
    expect(requiresNativeCompanion("ded", "Issued for Construction (IFC)", "drawing.dwg")).toBe(false);
  });

  it("does not impose the rule on Concept approval submissions", () => {
    expect(requiresNativeCompanion("concept", "Issued for Approval (IFA)", "study.pdf")).toBe(false);
  });
});
