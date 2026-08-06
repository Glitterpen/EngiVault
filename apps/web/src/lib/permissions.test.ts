import { describe,expect,it } from "vitest";
import { can } from "./permissions";

describe("role capabilities",()=>{
  it("prevents viewers and engineers from uploading",()=>{
    expect(can("viewer","document:write")).toBe(false);
    expect(can("engineer","document:write")).toBe(false);
  });
  it("allows document controllers to upload but not manage members",()=>{
    expect(can("document_controller","document:write")).toBe(true);
    expect(can("document_controller","members:manage")).toBe(false);
  });
  it("fails closed for an unknown role",()=>expect(can("owner","document:download")).toBe(false));
});
