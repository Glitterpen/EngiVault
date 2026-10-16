import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProjectDisciplineManager } from "./project-discipline-manager";
import { createProjectDiscipline, restoreProjectDiscipline } from "@/app/app/project-discipline-actions";
vi.mock("@/app/app/project-discipline-actions", () => ({ createProjectDiscipline: vi.fn(), restoreProjectDiscipline:vi.fn(),removeProjectDiscipline:vi.fn(),inspectProjectDisciplineRemoval:vi.fn() }));
beforeEach(()=>vi.resetAllMocks());
afterEach(cleanup);
describe("Project discipline controls", () => {
  it("provides a collapsible form and displays both imported and coded disciplines", () => {
    const {container}=render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[{ name: "HVAC", code: "" }, { name: "Rotating Equipment", code: "ROT" }]}/>);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.getByText("2 available")).toBeTruthy();
    fireEvent.click(screen.getByText("Project disciplines"));
    expect(screen.getByText("HVAC")).toBeTruthy();
    expect(screen.getByText("ROT — Rotating Equipment")).toBeTruthy();
    expect(screen.getByLabelText("Discipline name").getAttribute("maxlength")).toBe("80");
    expect(screen.getByLabelText("Short code (optional)").hasAttribute("required")).toBe(false);
    expect(screen.getByRole("button", { name: "Add discipline" })).toBeTruthy();
    expect(screen.getByRole("button",{name:"Remove HVAC"})).toBeTruthy();
  });
  it("keeps removed disciplines in a separate restorable list",()=>{
    render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[]} removedDisciplines={[{name:"HVAC",code:""}]}/>);
    fireEvent.click(screen.getByText("Project disciplines"));
    fireEvent.click(screen.getByText("Removed disciplines (1)"));
    expect(screen.getByRole("button",{name:"Restore HVAC"})).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Remove HVAC"})).toBeNull();
  });
  it("never presents mutation controls during member preview",()=>{
    render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[{name:"HVAC",code:""}]} removedDisciplines={[{name:"Process",code:"PRO"}]} readOnly/>);
    fireEvent.click(screen.getByText("Project disciplines"));
    fireEvent.click(screen.getByText("Removed disciplines (1)"));
    expect(screen.queryByRole("button",{name:/Add discipline|Remove |Restore |Delete /})).toBeNull();
    expect(screen.getAllByRole("button").every(button=>button.closest("[data-preview-safe]"))).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Managing project disciplines"}));
    expect(screen.getByRole("tooltip")).toBeTruthy();
  });
  it("preserves scoped discipline payloads, code validation and touch targets",async()=>{
    vi.mocked(createProjectDiscipline).mockResolvedValue({ok:true,message:"Discipline added."});
    render(<ProjectDisciplineManager organisationId="organisation-A" projectId="project-A" disciplines={[]}/>);
    fireEvent.click(screen.getByText("Project disciplines"));
    const name=screen.getByLabelText("Discipline name") as HTMLInputElement;
    const code=screen.getByLabelText("Short code (optional)") as HTMLInputElement;
    expect(name.required).toBe(true);expect(code.maxLength).toBe(24);expect(code.pattern).toBe("[A-Za-z0-9-]{1,24}");
    fireEvent.change(name,{target:{value:"Rotating Equipment"}});fireEvent.change(code,{target:{value:"ROT"}});
    const form=screen.getByRole("form",{name:"Add project discipline"}) as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"organisation-A",projectId:"project-A",name:"Rotating Equipment",code:"ROT"});
    expect(screen.getByRole("button",{name:"Add discipline"}).classList.contains("min-h-11")).toBe(true);
    await act(async()=>{fireEvent.submit(form);});
    expect(createProjectDiscipline).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(vi.mocked(createProjectDiscipline).mock.calls[0][1])).toEqual({organisationId:"organisation-A",projectId:"project-A",name:"Rotating Equipment",code:"ROT"});
    expect(screen.getByRole("status").textContent).toBe("Discipline added.");
  });
  it("reveals native validation and returned errors when the discipline panel is collapsed",async()=>{
    vi.mocked(createProjectDiscipline).mockResolvedValue({message:"That code is already in use."});
    const {container}=render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[]}/>);
    const disclosure=container.querySelector("details")!;
    fireEvent.invalid(screen.getByLabelText("Discipline name"));expect(disclosure.open).toBe(true);
    disclosure.open=false;
    await act(async()=>{fireEvent.submit(container.querySelector("form")!);});
    expect(disclosure.open).toBe(true);expect(screen.getByRole("alert").textContent).toBe("That code is already in use.");
  });
  it("reopens both removed and parent panels to expose restoration errors without changing the action payload",async()=>{
    vi.mocked(restoreProjectDiscipline).mockResolvedValue({message:"The discipline could not be restored."});
    const {container}=render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[]} removedDisciplines={[{name:"HVAC",code:""}]}/>);
    const disclosures=container.querySelectorAll("details");
    await act(async()=>{fireEvent.submit(container.querySelector('form[aria-label="Restore HVAC"]')!);});
    await waitFor(()=>expect(disclosures[0].open&&disclosures[1].open).toBe(true));
    expect(screen.getByRole("alert").textContent).toBe("The discipline could not be restored.");
    expect(Object.fromEntries(vi.mocked(restoreProjectDiscipline).mock.calls[0][1])).toEqual({organisationId:"org",projectId:"project",name:"HVAC"});
    expect(screen.getByRole("button",{name:"Restore HVAC"}).classList.contains("min-h-11")).toBe(true);
  });
  it("keeps long discipline labels wrappable and read-only lists available without mutation forms",()=>{
    const long="EngineeringDiscipline".repeat(10);
    const {container}=render(<ProjectDisciplineManager organisationId="org" projectId="project" disciplines={[{name:long,code:""}]} readOnly/>);
    fireEvent.click(screen.getByText("Project disciplines"));
    expect(screen.getByText(long).className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByRole("list",{name:"Available project disciplines"})).toBeTruthy();
    expect(container.querySelector("form")).toBeNull();expect(createProjectDiscipline).not.toHaveBeenCalled();
  });
});
