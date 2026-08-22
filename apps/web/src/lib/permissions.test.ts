import { describe,expect,it } from "vitest";
import {can,canInviteProjectRole,canPreviewProjectRole,canRemoveProjectMember,invitableProjectRoles} from "./permissions";

describe("role capabilities",()=>{
  it("prevents viewers and engineers from controlling the MDR",()=>{
    expect(can("viewer","document:write")).toBe(false);
    expect(can("engineer","document:write")).toBe(false);
  });
  it("allows engineers to submit only through discipline-aware upload checks",()=>{
    expect(can("engineer","document:submit_discipline")).toBe(true);
    expect(can("viewer","document:submit_discipline")).toBe(false);
  });
  it("allows document controllers to manage the MDR but not submit revisions",()=>{
    expect(can("document_controller","document:write")).toBe(true);
    expect(can("document_controller","document:submit_discipline")).toBe(false);
    expect(can("document_controller","members:manage")).toBe(false);
  });
  it("allows only document controllers to create MDR entries",()=>{
    expect(can("document_controller","document:register")).toBe(true);
    expect(can("document_controller","engineers:manage")).toBe(true);
    expect(can("organisation_admin","document:register")).toBe(false);
    expect(can("organisation_admin","document:write")).toBe(false);
    expect(can("project_admin","document:write")).toBe(false);
    expect(can("project_admin","document:register")).toBe(false);
    expect(can("engineer","document:register")).toBe(false);
    expect(can("viewer","document:register")).toBe(false);
  });
  it("separates organisation governance from project execution",()=>{
    expect(can("organisation_admin","project:create")).toBe(true);
    expect(can("organisation_admin","project:appoint")).toBe(true);
    expect(can("organisation_admin","project:manage")).toBe(false);
    expect(can("organisation_admin","members:manage")).toBe(false);
    expect(can("organisation_admin","engineers:manage")).toBe(false);
    expect(can("project_admin","project:manage")).toBe(true);
    expect(can("project_admin","members:manage")).toBe(true);
    expect(can("project_admin","engineers:manage")).toBe(true);
  });
  it("limits invitations to the roles each control level appoints",()=>{
    expect(invitableProjectRoles("organisation_admin")).toEqual(["project_admin","document_controller"]);
    expect(invitableProjectRoles("project_admin")).toEqual(["engineer"]);
    expect(invitableProjectRoles("document_controller")).toEqual(["engineer"]);
    expect(invitableProjectRoles("engineer")).toEqual([]);
    expect(canInviteProjectRole("organisation_admin","engineer")).toBe(false);
    expect(canInviteProjectRole("project_admin","project_admin")).toBe(false);
    expect(canInviteProjectRole("project_admin","viewer")).toBe(false);
    expect(canInviteProjectRole("document_controller","viewer")).toBe(false);
  });
  it("limits appointment removal to the same authority that appoints the role",()=>{
    expect(canRemoveProjectMember("organisation_admin","project_admin")).toBe(true);
    expect(canRemoveProjectMember("organisation_admin","document_controller")).toBe(true);
    expect(canRemoveProjectMember("organisation_admin","engineer")).toBe(false);
    expect(canRemoveProjectMember("project_admin","engineer")).toBe(true);
    expect(canRemoveProjectMember("project_admin","document_controller")).toBe(false);
    expect(canRemoveProjectMember("document_controller","engineer")).toBe(true);
    expect(canRemoveProjectMember("engineer","engineer")).toBe(false);
  });
  it("reserves lifecycle, backup and role-preview governance for organisation administrators",()=>{
    for(const capability of ["project:lifecycle","project:backup","project:preview_roles"] as const){
      expect(can("organisation_admin",capability)).toBe(true);
      expect(can("project_admin",capability)).toBe(false);
      expect(can("document_controller",capability)).toBe(false);
    }
  });
  it("limits administrator preview to the three operational workspaces",()=>{
    expect(canPreviewProjectRole("organisation_admin","project_admin")).toBe(true);
    expect(canPreviewProjectRole("organisation_admin","document_controller")).toBe(true);
    expect(canPreviewProjectRole("organisation_admin","engineer")).toBe(true);
    expect(canPreviewProjectRole("organisation_admin","viewer")).toBe(false);
    expect(canPreviewProjectRole("project_admin","document_controller")).toBe(false);
  });
  it("fails closed for an unknown role",()=>expect(can("owner","document:download")).toBe(false));
});
