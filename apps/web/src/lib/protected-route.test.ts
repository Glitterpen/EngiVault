import {describe,expect,it} from "vitest";
import {protectedSignInPath} from "./protected-route";

describe("protectedSignInPath",()=>{
  it("keeps organisation workspaces on the organisation login",()=>{
    expect(protectedSignInPath("/app")).toBe("/login");
    expect(protectedSignInPath("/app/example/projects/example")).toBe("/login");
  });

  it("routes every founder page through the dedicated founder login",()=>{
    expect(protectedSignInPath("/founder")).toBe("/founder-access");
    expect(protectedSignInPath("/founder/deleted")).toBe("/founder-access");
  });
});
