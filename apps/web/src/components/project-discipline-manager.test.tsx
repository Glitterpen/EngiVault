import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectDisciplineManager } from "./project-discipline-manager";
vi.mock("@/app/app/project-discipline-actions", () => ({ createProjectDiscipline: vi.fn(), restoreProjectDiscipline:vi.fn(),removeProjectDiscipline:vi.fn(),inspectProjectDisciplineRemoval:vi.fn() }));
afterEach(cleanup);
describe("Project discipline controls", () => {
  it("provides a collapsible form and displays both imported and coded disciplines", () => {
    render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[{ name: "HVAC", code: "" }, { name: "Rotating Equipment", code: "ROT" }]}/>);
    fireEvent.click(screen.getByText("Project disciplines · Manage disciplines"));
    expect(screen.getByText("HVAC")).toBeTruthy();
    expect(screen.getByText("ROT — Rotating Equipment")).toBeTruthy();
    expect(screen.getByLabelText("Discipline name").getAttribute("maxlength")).toBe("80");
    expect(screen.getByLabelText("Short code (optional)").hasAttribute("required")).toBe(false);
    expect(screen.getByRole("button", { name: "Add discipline" })).toBeTruthy();
    expect(screen.getByRole("button",{name:"Remove HVAC"})).toBeTruthy();
  });
  it("keeps removed disciplines in a separate restorable list",()=>{
    render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[]} removedDisciplines={[{name:"HVAC",code:""}]}/>);
    fireEvent.click(screen.getByText("Project disciplines · Manage disciplines"));
    fireEvent.click(screen.getByText("Removed disciplines (1)"));
    expect(screen.getByRole("button",{name:"Restore HVAC"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Remove HVAC"})).toBeNull();
  });
  it("never presents mutation controls during member preview",()=>{
    render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[{name:"HVAC",code:""}]} removedDisciplines={[{name:"Process",code:"PRO"}]} readOnly/>);
    fireEvent.click(screen.getByText("Project disciplines · Manage disciplines"));
    fireEvent.click(screen.getByText("Removed disciplines (1)"));
    expect(screen.queryByRole("button",{name:/Add discipline|Remove |Restore |Delete /})).toBeNull();
    expect(screen.getAllByRole("button").every(button=>button.closest("[data-preview-safe]"))).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Managing project disciplines"}));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
});
