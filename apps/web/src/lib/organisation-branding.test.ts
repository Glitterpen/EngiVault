import {describe,expect,it} from "vitest";
import {organisationLogoEndpoint} from "@/lib/organisation-branding";

describe("organisation logo endpoint",()=>{
 it("uses the private tenant-scoped logo route",()=>{
  expect(organisationLogoEndpoint("11111111-1111-1111-1111-111111111111"))
   .toBe("/api/v1/organisations/11111111-1111-1111-1111-111111111111/logo");
 });

 it("adds an encoded version for immediate logo refresh",()=>{
  expect(organisationLogoEndpoint("11111111-1111-1111-1111-111111111111","2026-08-12T09:15:00+01:00"))
   .toBe("/api/v1/organisations/11111111-1111-1111-1111-111111111111/logo?v=2026-08-12T09%3A15%3A00%2B01%3A00");
 });
});
