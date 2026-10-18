import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {afterEach, expect, it} from "vitest";
import {renderToString} from "react-dom/server";
import {EngineerDisciplineFolder} from "./engineer-discipline-folder";

afterEach(cleanup);

it("renders an initially closed native discipline folder with accessible counts and its scoped content intact", () => {
  const html = renderToString(<EngineerDisciplineFolder discipline="Electrical" totalCount={12} matchCount={12} actionCount={4} acceptedPercent={45.4}><p>Electrical IFA content</p></EngineerDisciplineFolder>);
  expect(html).toContain('aria-label="Electrical deliverables"');
  expect(html).not.toMatch(/<details[^>]*\bopen=/);
  expect(html).toContain("Electrical IFA content");
  expect(html).toContain("12");
  expect(html).toContain("4");
  expect(html.replace(/<!--[\s\S]*?-->/g, "")).toContain("4 need attention");
  expect(html).toContain("45");
  expect(html).toContain("accepted progress");
  expect(html).toContain("focus-visible:outline");
  expect(html).toContain("min-h-16");
  expect(html).toContain("motion-reduce:transition-none");
  expect(html).not.toContain("<button");
});

it("keeps discipline disclosure state independent and does not merge child issue sections", () => {
  const {container} = render(<>
    <EngineerDisciplineFolder discipline="Electrical" totalCount={1} matchCount={1} actionCount={0} acceptedPercent={100}><h3>Electrical IFA</h3></EngineerDisciplineFolder>
    <EngineerDisciplineFolder discipline="Instrumentation" totalCount={1} matchCount={1} actionCount={1} acceptedPercent={0}><h3>Instrumentation IFA</h3></EngineerDisciplineFolder>
  </>);
  const folders = container.querySelectorAll("details");
  expect([...folders].every(folder => !folder.open)).toBe(true);
  fireEvent.click(folders[0].querySelector("summary")!);
  expect(folders[0].open).toBe(true);
  expect(folders[1].open).toBe(false);
  expect(within(folders[0]).getByRole("heading", {name: "Electrical IFA"})).toBeTruthy();
  expect(within(folders[0]).queryByText("Instrumentation IFA")).toBeNull();
  expect(within(folders[1]).getByText("1 needs attention")).toBeTruthy();
});

it("shows an empty authorised discipline without action noise and names search matches explicitly", () => {
  const {container} = render(<EngineerDisciplineFolder discipline="Instrumentation and Control Systems Engineering" totalCount={4} matchCount={0} actionCount={0} acceptedPercent={25} defaultOpen><p>No matching deliverables</p></EngineerDisciplineFolder>);
  expect(container.querySelector("details")?.open).toBe(true);
  expect(screen.getByText(/0 matching/)).toBeTruthy();
  expect(screen.queryByText(/need attention/)).toBeNull();
  expect(screen.getByText("No matching deliverables")).toBeTruthy();
  expect(container.querySelector("summary")?.className).toContain("minmax(0,1fr)");
  expect(screen.getByText("Instrumentation and Control Systems Engineering").className).toContain("break-words");
});

it.each([[-5, "0%"], [110, "100%"], [Number.NaN, "0%"]])("bounds the displayed percentage safely for %s", (percent, label) => {
  render(<EngineerDisciplineFolder discipline="Electrical" totalCount={0} matchCount={0} actionCount={0} acceptedPercent={percent}><p>No assigned deliverables</p></EngineerDisciplineFolder>);
  expect(screen.getByText(label)).toBeTruthy();
});
