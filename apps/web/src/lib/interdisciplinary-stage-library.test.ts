import {expect,it} from "vitest";
import {interdisciplinaryIssueStageCode,interdisciplinaryLibraryQuery,interdisciplinaryStageAnchor,interdisciplinaryStageLibrarySchema,interdisciplinaryStagePages} from "./interdisciplinary-stage-library";

it.each([["IFR","IFR"],["issued for review","IFR"],[" Issued for Review (IFR) ","IFR"],["IFA","IFA"],["Issued for Approval","IFA"],["Issued for Approval (IFA)","IFA"],["\tIFD\n","IFD"],["Issued for Design","IFD"],["Issued for Design (IFD)","IFD"],["IFC","IFC"],["Issued for Construction","IFC"],["Issued for Construction (IFC)","IFC"],[" Coordination / Café ","purpose:coordination / café"]])("maps actual revision purpose %s to its exact RPC stage %s",(purpose,stage)=>{
  expect(interdisciplinaryIssueStageCode(purpose)).toBe(stage);
});

it("keeps canonical and custom stage anchors stable across fragment decoding",()=>{
  expect(interdisciplinaryStageAnchor("IFR")).toBe("stage-IFR");
  const anchor=interdisciplinaryStageAnchor("purpose:coordination / café");
  expect(anchor).not.toContain("%");expect(decodeURIComponent(anchor)).toBe(anchor);expect(anchor).not.toMatch(/\s/);
  expect(interdisciplinaryStageAnchor("purpose:foo bar")).not.toBe(interdisciplinaryStageAnchor("purpose:foo_20bar"));
});

it("uses independent bounded issue-stage pages while accepting old global links",()=>{
  expect(interdisciplinaryStagePages({page:"3",page_IFA:"2",page_IFR:"-1",page_IFC:"999999",page_IFD:["2","3"]})).toEqual({IFR:1,IFA:2,IFD:3,IFC:40000});
});
it("preserves explicit custom issue-purpose pages without reading unrelated query inputs",()=>{
  expect(interdisciplinaryStagePages({q:"test",discipline:"Electrical","page_purpose:coordination issue":"4"})).toEqual({IFR:1,IFA:1,IFD:1,IFC:1,"purpose:coordination issue":4});
});
it("encodes search and discipline and excludes first pages from links",()=>{
  const query=interdisciplinaryLibraryQuery("Cable & tray","Electrical / Instrumentation",{IFR:1,IFA:3,"purpose:coordination issue":2});
  expect(query.get("q")).toBe("Cable & tray");expect(query.get("discipline")).toBe("Electrical / Instrumentation");expect(query.get("page_IFR")).toBeNull();expect(query.get("page_IFA")).toBe("3");expect(query.get("page_purpose:coordination issue")).toBe("2");
});
it("fails closed for old, malformed or incomplete library responses",()=>{
  for(const input of [null,{}, {total:1,disciplines:["Electrical"],documents:[]},{total:-1,revisionTotal:0,matchTotal:0,matchRevisionTotal:0,disciplines:[],stages:[]}])expect(interdisciplinaryStageLibrarySchema.safeParse(input).success).toBe(false);
  expect(interdisciplinaryStageLibrarySchema.safeParse({total:0,revisionTotal:0,matchTotal:0,matchRevisionTotal:0,disciplines:[],stages:[]}).success).toBe(true);
});
it("defaults a missing project lifecycle flag to read-only rather than enabling interaction",()=>{
  const result=interdisciplinaryStageLibrarySchema.parse({total:0,revisionTotal:0,matchTotal:0,matchRevisionTotal:0,disciplines:[],stages:[]});
  expect(result.projectActive).toBe(false);
});
