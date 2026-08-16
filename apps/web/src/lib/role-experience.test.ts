import {describe,expect,it} from "vitest";
import {canCreateOrganisationWorkspace,canOpenOperationalMdr,projectHomePath,roleLabel,scopedRoleLabel,workspacePersona} from "./role-experience";

describe("role-specific workspaces",()=>{
  it("routes management roles to oversight",()=>{
    expect(projectHomePath("o","p","organisation_admin")).toBe("/app/o/projects/p/overview");
    expect(projectHomePath("o","p","project_admin")).toBe("/app/o/projects/p/overview");
    expect(workspacePersona("organisation_admin")).toBe("management");
  });

  it("routes DCC and engineers to independent operational homes",()=>{
    expect(projectHomePath("o","p","document_controller")).toBe("/app/o/projects/p/control");
    expect(projectHomePath("o","p","engineer")).toBe("/app/o/projects/p/assignments");
    expect(workspacePersona("document_controller")).toBe("document_control");
    expect(workspacePersona("engineer")).toBe("engineering");
  });

  it("keeps operational MDR controls away from management and engineers",()=>{
    expect(canOpenOperationalMdr("organisation_admin")).toBe(false);
    expect(canOpenOperationalMdr("project_admin")).toBe(false);
    expect(canOpenOperationalMdr("engineer")).toBe(false);
    expect(canOpenOperationalMdr("document_controller")).toBe(true);
    expect(roleLabel("document_controller")).toBe("Document Controller");
  });

  it("names an engineer from the discipline assigned in the active project",()=>{
    expect(scopedRoleLabel("engineer",["Process"])).toBe("Process Engineer");
    expect(scopedRoleLabel("engineer",["Piping"])).toBe("Piping Engineer");
    expect(scopedRoleLabel("engineer",["Mechanical"])).toBe("Mechanical Engineer");
    expect(scopedRoleLabel("engineer",["Process","Piping"])).toBe("Process / Piping Engineer");
    expect(scopedRoleLabel("engineer",[])).toBe("Discipline Engineer");
    expect(scopedRoleLabel("document_controller",["Process"])).toBe("Document Controller");
  });

  it("does not give organisation creation rights to a DCC",()=>{
    expect(canCreateOrganisationWorkspace(["member"],["document_controller"])).toBe(false);
    expect(canCreateOrganisationWorkspace([],["document_controller"])).toBe(false);
    expect(canCreateOrganisationWorkspace([],[])).toBe(false);
    expect(canCreateOrganisationWorkspace([],[],true)).toBe(true);
    expect(canCreateOrganisationWorkspace(["organisation_admin"],["document_controller"])).toBe(true);
  });
});
