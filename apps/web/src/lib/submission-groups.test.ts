import {expect, it} from "vitest";
import {groupSubmissions} from "./submission-groups";

const item = (issue: string | null) => ({latest: issue === null ? null : {issue_status: issue}});

it("groups issue purposes in workflow order and combines codes with full labels", () => {
  const groups = groupSubmissions([item("IFC"), item("IFA"), item("IFR"), item(null), item("Issued for Review (IFR)"), item("IFD")]);
  expect(groups.map(group => group.label)).toEqual(["Not submitted", "Issued for Review (IFR)", "Issued for Approval (IFA)", "Issued for Design (IFD)", "Issued for Construction (IFC)"]);
  expect(groups[1].items).toHaveLength(2);
});

it("retains custom and blank submitted purposes rather than hiding documents", () => {
  const items = [item(" Specialist issue "), item("specialist issue"), item(""), item("Issued for Tender (IFT)")];
  const groups = groupSubmissions(items);
  expect(groups.find(group => group.label === "Specialist issue")?.items).toHaveLength(2);
  expect(groups.find(group => group.label === "Issue purpose not specified")?.items).toHaveLength(1);
  expect(groups.flatMap(group => group.items)).toHaveLength(items.length);
  expect(items[0].latest?.issue_status).toBe(" Specialist issue ");
});

it("does not create empty groups", () => expect(groupSubmissions([])).toEqual([]));
