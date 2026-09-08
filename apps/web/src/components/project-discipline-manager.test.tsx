import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectDisciplineManager } from "./project-discipline-manager";
vi.mock("@/app/app/project-discipline-actions", () => ({ createProjectDiscipline: vi.fn() }));
afterEach(cleanup);
describe("Project discipline controls", () => {
  it("provides a collapsible form and displays both imported and coded disciplines", () => {
    render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[{ name: "HVAC", code: "" }, { name: "Rotating Equipment", code: "ROT" }]}/>);
    fireEvent.click(screen.getByText("Project disciplines · Add discipline"));
    expect(screen.getByText("HVAC")).toBeTruthy();
    expect(screen.getByText("ROT — Rotating Equipment")).toBeTruthy();
    expect(screen.getByLabelText("Discipline name").getAttribute("maxlength")).toBe("80");
    expect(screen.getByLabelText("Short code (optional)").hasAttribute("required")).toBe(false);
    expect(screen.getByRole("button", { name: "Add discipline" })).toBeTruthy();
  });
});
