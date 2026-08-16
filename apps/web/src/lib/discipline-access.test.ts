import {describe,expect,it} from "vitest";
import {canonicalDiscipline,disciplineMatches} from "./discipline-access";

describe("discipline-scoped document access",()=>{
  it("matches the same discipline despite harmless case or spacing differences",()=>{
    expect(disciplineMatches("Piping"," piping ")).toBe(true);
    expect(disciplineMatches("Civil  / Structural","civil / structural")).toBe(true);
  });

  it("does not allow one engineering discipline to access another",()=>{
    expect(disciplineMatches("Piping","Process")).toBe(false);
    expect(disciplineMatches("Mechanical","Electrical")).toBe(false);
  });

  it("returns the controlled MDR category name",()=>{
    expect(canonicalDiscipline(["Process","Piping","Mechanical"],"piping")).toBe("Piping");
    expect(canonicalDiscipline(["Process","Piping"],"Structural")).toBeUndefined();
  });
});
