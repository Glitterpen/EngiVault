import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, expect, it} from "vitest";
import {renderToString} from "react-dom/server";
import {EngineerSubmissionGroup} from "./engineer-submission-group";

afterEach(cleanup);
const cards = (count: number) => Array.from({length: count}, (_, index) => <article key={index}><h3>Deliverable {index + 1}</h3><a href={`/documents/${index + 1}#submit-revision`}>Open deliverable {index + 1}</a></article>);

it("keeps all authorised cards available in server-rendered HTML without JavaScript", () => {
  const html = renderToString(<EngineerSubmissionGroup label="IFA">{cards(30)}</EngineerSubmissionGroup>);
  expect(html.match(/<article>/g)).toHaveLength(30);
  expect(html).not.toContain("<button");
  expect(html).not.toContain("<details open");
});

it("starts collapsed and retains all group counts while limiting the visible cards", () => {
  const {container} = render(<EngineerSubmissionGroup label="Issued for Approval (IFA)">{cards(30)}</EngineerSubmissionGroup>);
  const group = container.querySelector("details")!;
  expect(group.open).toBe(false);
  expect(group.querySelector("summary")?.textContent).toContain("30 deliverables");
  fireEvent.click(group.querySelector("summary")!);
  expect(screen.getAllByRole("heading", {level: 3})).toHaveLength(8);
  expect(screen.getByRole("status").textContent).toBe("Showing 1–8 of 30");
  expect(screen.getByRole("button", {name: /Previous deliverables/}).hasAttribute("disabled")).toBe(true);
});

it("pages through every card in order and preserves document destinations and keyboard focus", () => {
  const {container} = render(<EngineerSubmissionGroup label="IFA">{cards(30)}</EngineerSubmissionGroup>);
  fireEvent.click(container.querySelector("summary")!);
  const next = screen.getByRole("button", {name: "Next deliverables in IFA"});
  expect(next.hasAttribute("data-preview-safe")).toBe(true);
  next.focus();
  fireEvent.click(next);
  expect(document.activeElement).toBe(next);
  expect(screen.getByRole("status").textContent).toBe("Showing 9–16 of 30");
  expect(screen.getByRole("link", {name: "Open deliverable 9"}).getAttribute("href")).toBe("/documents/9#submit-revision");
  expect(screen.queryByRole("link", {name: "Open deliverable 1"})).toBeNull();
  fireEvent.click(next); fireEvent.click(next);
  expect(screen.getAllByRole("heading", {level: 3})).toHaveLength(6);
  expect(screen.getByRole("status").textContent).toBe("Showing 25–30 of 30");
  expect(next.hasAttribute("disabled")).toBe(true);
  fireEvent.click(screen.getByRole("button", {name: "Previous deliverables in IFA"}));
  expect(screen.getByRole("status").textContent).toBe("Showing 17–24 of 30");
});

it("keeps paging independent across issue groups and small groups free of paging controls", () => {
  const {container} = render(<><EngineerSubmissionGroup label="IFR">{cards(12)}</EngineerSubmissionGroup><EngineerSubmissionGroup label="IFD">{cards(1)}</EngineerSubmissionGroup></>);
  const groups = container.querySelectorAll("details");
  for (const group of groups) fireEvent.click(group.querySelector("summary")!);
  fireEvent.click(screen.getByRole("button", {name: "Next deliverables in IFR"}));
  expect(within(groups[1]).getByRole("heading", {name: "Deliverable 1"})).toBeTruthy();
  expect(within(groups[1]).queryByRole("navigation")).toBeNull();
});

it("distinguishes repeated issue-purpose pagination by discipline scope without changing the visible issue labels", () => {
  const {container} = render(<><EngineerSubmissionGroup label="IFR" scopeLabel="Electrical">{cards(12)}</EngineerSubmissionGroup><EngineerSubmissionGroup label="IFR" scopeLabel="Instrumentation">{cards(12)}</EngineerSubmissionGroup></>);
  const groups = container.querySelectorAll("details");
  for (const group of groups) fireEvent.click(group.querySelector("summary")!);
  expect(screen.getByRole("navigation", {name: "Electrical — IFR deliverable pages"})).toBeTruthy();
  expect(screen.getByRole("navigation", {name: "Instrumentation — IFR deliverable pages"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Next deliverables in Electrical — IFR"}));
  expect(within(groups[0]).getByRole("status").textContent).toBe("Showing 9–12 of 12");
  expect(within(groups[1]).getByRole("status").textContent).toBe("Showing 1–8 of 12");
  expect(groups[0].querySelector("summary")?.textContent).toBe("IFR 12 deliverables");
});
