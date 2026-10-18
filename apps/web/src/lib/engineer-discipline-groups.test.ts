import {describe, expect, it} from "vitest";
import {groupEngineerDisciplineItems, type EngineerDeliverableSort} from "./engineer-discipline-groups";

type Item = {discipline: string; number: string; issue: string; createdAt?: string | null; due?: string | null};
function group(items: readonly Item[], authorisedDisciplines: readonly string[], sort?: EngineerDeliverableSort) {
  return groupEngineerDisciplineItems({items, authorisedDisciplines, sort, getDiscipline: item => item.discipline, getDocumentNumber: item => item.number, getCreatedAt: item => item.createdAt, getDueDate: item => item.due});
}

describe("engineer discipline presentation", () => {
  it("keeps identical issue purposes in their own authorised discipline folders", () => {
    const result = group([
      {discipline: "Instrumentation", number: "INS-001", issue: "Issued for Approval (IFA)"},
      {discipline: "Electrical", number: "ELE-001", issue: "Issued for Approval (IFA)"},
      {discipline: "Instrumentation", number: "INS-002", issue: "Issued for Review (IFR)"},
    ], ["Instrumentation", "Electrical"]);
    expect(result.map(folder => [folder.discipline, folder.items.map(item => item.number)])).toEqual([
      ["Electrical", ["ELE-001"]], ["Instrumentation", ["INS-001", "INS-002"]],
    ]);
  });

  it("retains authorised empty scopes, deduplicates harmless label variants and omits out-of-scope items", () => {
    const result = group([
      {discipline: " electrical ", number: "ELE-1", issue: "IFR"},
      {discipline: "Process", number: "PRO-1", issue: "IFD"},
      {discipline: "", number: "UNKNOWN", issue: "IFR"},
    ], ["Electrical", " Instrumentation ", "ELECTRICAL", "Piping  Design", " "]);
    expect(result).toEqual([
      {discipline: "Electrical", items: [{discipline: " electrical ", number: "ELE-1", issue: "IFR"}]},
      {discipline: "Instrumentation", items: []},
      {discipline: "Piping Design", items: []},
    ]);
    expect(group([{discipline: "Electrical", number: "ELE-1", issue: "IFR"}], [])).toEqual([]);
  });

  it("sorts recent submissions first, with natural document numbers breaking ties and missing or invalid dates last", () => {
    const result = group([
      {discipline: "Electrical", number: "ELE-20", issue: "IFR", createdAt: "2026-10-17T12:00:00Z"},
      {discipline: "Electrical", number: "ELE-1", issue: "IFR", createdAt: "invalid"},
      {discipline: "Electrical", number: "ELE-9", issue: "IFR", createdAt: "2026-10-17T12:00:00Z"},
      {discipline: "Electrical", number: "ELE-8", issue: "IFR", createdAt: "2026-10-16T12:00:00Z"},
      {discipline: "Electrical", number: "ELE-2", issue: "IFR", createdAt: null},
      {discipline: "Electrical", number: "ELE-30", issue: "IFR", createdAt: "2026-10-18T12:00:00Z"},
    ], ["Electrical"]);
    expect(result[0].items.map(item => item.number)).toEqual(["ELE-30", "ELE-9", "ELE-20", "ELE-8", "ELE-1", "ELE-2"]);
  });

  it("sorts due dates earliest first, with undated submissions last and natural document number ties", () => {
    const result = group([
      {discipline: "Electrical", number: "ELE-20", issue: "IFD", due: "2026-10-17"},
      {discipline: "Electrical", number: "ELE-1", issue: "IFR", due: undefined},
      {discipline: "Electrical", number: "ELE-9", issue: "IFA", due: "2026-10-17"},
      {discipline: "Electrical", number: "ELE-8", issue: "IFR", due: "2026-10-16"},
      {discipline: "Electrical", number: "ELE-2", issue: "IFR", due: "invalid"},
    ], ["Electrical"], "due");
    expect(result[0].items.map(item => item.number)).toEqual(["ELE-8", "ELE-9", "ELE-20", "ELE-1", "ELE-2"]);
  });

  it("uses natural document order when selected without mutating input arrays or objects", () => {
    const items: readonly Item[] = Object.freeze([
      Object.freeze({discipline: "Electrical", number: "ELE-10", issue: "IFD", createdAt: "2026-10-18"}),
      Object.freeze({discipline: "Electrical", number: "ELE-2", issue: "IFR", createdAt: "2026-10-16"}),
      Object.freeze({discipline: "Electrical", number: "ELE-1", issue: "IFA", createdAt: "2026-10-17"}),
    ]);
    const scopes = Object.freeze(["Electrical"]);
    const result = group(items, scopes, "number");
    expect(result[0].items.map(item => item.number)).toEqual(["ELE-1", "ELE-2", "ELE-10"]);
    expect(items.map(item => item.number)).toEqual(["ELE-10", "ELE-2", "ELE-1"]);
    expect(result[0].items[0]).toBe(items[2]);
  });
});
