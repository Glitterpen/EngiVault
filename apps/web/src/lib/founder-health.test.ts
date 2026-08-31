import {describe, expect, it} from "vitest";
import {healthClasses, licenceDurationLabel, licenceTimeLabel} from "./founder-health";

describe("founder account health presentation",()=>{
  it("explains licence time without inventing an expiry date",()=>{
    expect(licenceTimeLabel(null,"active")).toBe("No fixed end date");
    expect(licenceTimeLabel(1,"trialing")).toBe("1 day remaining");
    expect(licenceTimeLabel(14,"active")).toBe("14 days remaining");
    expect(licenceTimeLabel(0,"cancelled")).toBe("Expired");
  });

  it("uses readable licence durations",()=>{
    expect(licenceDurationLabel(90)).toBe("3 months");
    expect(licenceDurationLabel(365)).toBe("1 year");
    expect(licenceDurationLabel(null)).toBe("Not available");
  });

  it("gives every health state a distinct treatment",()=>{
    expect(healthClasses("healthy")).toContain("edf8f4");
    expect(healthClasses("attention")).toContain("fff8e8");
    expect(healthClasses("critical")).toContain("fff0ef");
  });
});

