import {expect,it} from "vitest";
import {mdrBrowseQuery,mdrFolderPage,mdrReturnHref} from "./mdr-browse-position";

it("keeps only bounded browsing metadata in the MDR query",()=>{
  expect(Object.fromEntries(new URLSearchParams(mdrBrowseQuery({search:' EL,(%load) ',records:"removed",folder:"Electrical",page:2}))))
    .toEqual({q:"ELload",records:"removed",folder:"Electrical",folderPage:"2"});
  expect(mdrBrowseQuery({folder:null,page:8})).toBe("");
});
it.each([undefined,null,"0","-1","2.5","Infinity","1e3","9999999",{},Number.NaN])("ignores malformed folder page %s",value=>{
  expect(mdrFolderPage(value)).toBe(1);
});
it("clamps a remembered page to the current authorised discipline count",()=>{
  expect(mdrFolderPage("20",27)).toBe(2);
  expect(mdrFolderPage(2,0)).toBe(1);
  expect(mdrFolderPage("2",27)).toBe(2);
});
it("reconstructs return navigation inside the current authorised project only",()=>{
  expect(mdrReturnHref("org","project","folder=Electrical&folderPage=2&q=load&records=removed"))
    .toBe("/app/org/projects/project/documents?q=load&records=removed&folder=Electrical&folderPage=2");
});
it.each([
  "https://external.test/", "//external.test/?folder=Electrical", "folder=Electrical&preview=secret",
  "folder=Electrical&organisationId=foreign", "folder=Electrical&folder=Mechanical", "q=load",
  `folder=${"A".repeat(161)}`, "folder=Electrical%0A", ["folder=Electrical"],null,
])("rejects untrusted or ambiguous return metadata %s",value=>{
  expect(mdrReturnHref("org","project",value)).toBeNull();
});
