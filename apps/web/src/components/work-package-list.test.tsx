import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,expect,it} from "vitest";
import {WorkPackageList,type WorkPackageListItem} from "./work-package-list";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import {vi} from "vitest";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
afterEach(cleanup);
const props={organisationId:"org",projectId:"project"};
const row=(id:string,kind="package",state="ready"):WorkPackageListItem=>({id,package_number:`PKG-${id}`,name:`Engineering ${id}`,version:2,state,destination:"local",manifest:kind==="transmittal"?{kind:"document_transmittal",recipient:{company:"Coastal Refinery"}}:{},created_at:"2026-10-16T08:00:00Z"});
const packages=[row("new","transmittal"),row("middle","package","failed"),row("old","transmittal","frozen")];
it("preserves server order and exact package links while labelling generated versus staged transmittals",()=>{
  render(<WorkPackageList {...props} packages={packages}/>);
  const links=screen.getAllByRole("link");expect(links.map(link=>link.getAttribute("href"))).toEqual(packages.map(item=>`/app/org/projects/project/work-packages/${item.id}`));
  expect(screen.getByText("Transmittal generated")).toBeTruthy();expect(screen.getByText("Frozen · awaiting ZIP")).toBeTruthy();expect(screen.getByText("Generation failed")).toBeTruthy();
  expect(screen.getAllByText("16 Oct 2026")).toHaveLength(3);
});
it("keeps a ready package distinct from a generated transmittal and frozen or failed history",()=>{
  const items=[row("download","package"),row("transmitted","transmittal"),row("frozen","transmittal","frozen"),row("failed","transmittal","failed")];
  render(<WorkPackageList {...props} packages={items}/>);
  const ready=screen.getByText("Ready to download"),generated=screen.getByText("Transmittal generated");
  expect(ready.className).toContain("bg-[#edf2f8]");expect(generated.className).toContain("bg-[#edf2f8]");
  expect(screen.getByText("Frozen · awaiting ZIP").className).toContain("bg-[#f3f6f9]");
  expect(screen.getByText("Generation failed").className).toContain("bg-[#fff0eb]");
  for(const badge of [ready,generated]){expect(badge.hasAttribute("role")).toBe(false);expect(badge.hasAttribute("aria-live")).toBe(false);}
  expect(screen.queryByText("Submitted")).toBeNull();
  expect(screen.getAllByRole("link").map(link=>link.getAttribute("href"))).toEqual(items.map(item=>`/app/org/projects/project/work-packages/${item.id}`));
});
it.each(["PKG-middle","engineering middle","coastal refinery"])("searches numbers, names and recipients without mutation: %s",search=>{
  render(<WorkPackageList {...props} packages={packages}/>);
  fireEvent.change(screen.getByRole("searchbox",{name:"Search transmittals and packages"}),{target:{value:search}});
  expect(screen.getAllByRole("link")).toHaveLength(search==="coastal refinery"?2:1);
});
it("combines category and search, offers clear state, and preserves data",()=>{
  render(<WorkPackageList {...props} packages={packages}/>);
  fireEvent.click(screen.getByRole("button",{name:"Transmittals 2"}));
  expect(screen.getAllByRole("link")).toHaveLength(2);
  fireEvent.change(screen.getByRole("searchbox"),{target:{value:"middle"}});
  expect(screen.queryByRole("link")).toBeNull();expect(screen.getByRole("status").textContent).toBe("0 of 3 records");
  fireEvent.click(screen.getByRole("button",{name:"Clear search and category"}));expect(screen.getAllByRole("link")).toHaveLength(3);
  expect(packages.map(item=>item.id)).toEqual(["new","middle","old"]);
});
it("renders the real empty state and an accessible named history region",()=>{
  render(<WorkPackageList {...props} packages={[]}/>);expect(screen.getByRole("region",{name:"Package history"})).toBeTruthy();expect(screen.getByText("No transmittals or work packages created yet.")).toBeTruthy();expect(screen.queryByRole("button",{name:"Clear search and category"})).toBeNull();
});
it("supports long identifiers without truncating or hiding the full name",()=>{
  const item={...row("long"),package_number:"X".repeat(160),name:"Long engineering package title ".repeat(10)};
  render(<WorkPackageList {...props} packages={[item]}/>);expect(screen.getByRole("heading",{name:item.package_number})).toBeTruthy();expect(screen.getByText(item.name.trim())).toBeTruthy();expect(screen.getAllByRole("button").every(button=>button.classList.contains("min-h-11"))).toBe(true);
});
it("keeps read-only search and categories usable in audited preview",()=>{
  render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"document_controller",displayName:"DCC",disciplines:[],expiresAt:"2099-01-01"}}><WorkPackageList {...props} packages={packages}/></AdminPreviewBoundary>);
  const search=screen.getByRole("searchbox") as HTMLInputElement;expect(search.disabled).toBe(false);expect((screen.getByRole("button",{name:"Work packages 1"}) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole("button",{name:"Work packages 1"}));expect(screen.getAllByRole("link")).toHaveLength(1);
});
