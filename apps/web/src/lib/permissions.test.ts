import { describe,expect,it } from "vitest";
import { can } from "./permissions";

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
  it("fails closed for an unknown role",()=>expect(can("owner","document:download")).toBe(false));
});
