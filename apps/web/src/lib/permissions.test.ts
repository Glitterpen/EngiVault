import { describe,expect,it } from "vitest";
import { can } from "./permissions";
describe("role capabilities",()=>{
  it("prevents viewers and engineers from writing documents",()=>{expect(can("viewer","document:write")).toBe(false);expect(can("engineer","document:write")).toBe(false)});
  it("allows controllers to write but not manage members",()=>{expect(can("document_controller","document:write")).toBe(true);expect(can("document_controller","members:manage")).toBe(false)});
  it("disables viewer AI by default",()=>expect(can("viewer","ai:use")).toBe(false));
  it("allows only organisation admins to create projects",()=>{expect(can("organisation_admin","project:create")).toBe(true);expect(can("project_admin","project:create")).toBe(false)});
});
