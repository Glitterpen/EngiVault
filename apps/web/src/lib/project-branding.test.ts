import {describe,expect,it} from "vitest";
import {projectLogoEndpoint} from "@/lib/project-branding";

describe("project client logo endpoint",()=>{
 it("uses the tenant and project scoped private route",()=>{
 expect(projectLogoEndpoint("11111111-1111-1111-1111-111111111111","22222222-2222-4222-8222-222222222222"))
   .toBe("/api/v1/organisations/11111111-1111-1111-1111-111111111111/projects/22222222-2222-4222-8222-222222222222/logo");
 });
 it("addresses additional report logos without exposing storage paths",()=>{
  expect(projectLogoEndpoint("11111111-1111-1111-1111-111111111111","22222222-2222-4222-8222-222222222222",null,3))
   .toBe("/api/v1/organisations/11111111-1111-1111-1111-111111111111/projects/22222222-2222-4222-8222-222222222222/logo?index=3");
 });
});
