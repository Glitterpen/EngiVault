import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {DocumentCategoryManagement,type DocumentCategory} from "./document-category-management";
import {toggleDocumentCategory} from "@/app/app/actions";

vi.mock("@/app/app/actions",()=>({toggleDocumentCategory:vi.fn(async()=>undefined)}));
const categories:DocumentCategory[]=[
  {id:"process",kind:"discipline",code:"PR",name:"Process engineering",is_active:true},
  {id:"drawing",kind:"document_type",code:"DWG",name:"Drawing",is_active:false},
];
beforeEach(()=>{vi.mocked(toggleDocumentCategory).mockReset();vi.mocked(toggleDocumentCategory).mockResolvedValue(undefined);});
afterEach(cleanup);

describe("category list reflow and accessible controls",()=>{
  it("uses one labelled, reflowing card list with explicit category metadata",()=>{
    const {container}=render(<DocumentCategoryManagement organisationId="organisation-A" categories={categories}/>);
    const region=screen.getByRole("region",{name:"Registered categories"});
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(within(region).getByText("2 categories")).toBeTruthy();
    const process=screen.getByRole("article",{name:"Process engineering"});
    for(const label of ["Kind","Short code","Status"])expect(within(process).getByText(label)).toBeTruthy();
    expect(within(process).getByText("discipline")).toBeTruthy();expect(within(process).getByText("PR")).toBeTruthy();expect(within(process).getByText("Active")).toBeTruthy();
    expect(within(screen.getByRole("article",{name:"Drawing"})).getByText("Inactive")).toBeTruthy();
    expect(container.querySelector("table")).toBeNull();
    expect(screen.getByRole("button",{name:"Disable Process engineering discipline"})).toBeTruthy();
    expect(screen.getByRole("button",{name:"Enable Drawing document type"})).toBeTruthy();
  });
  it("wraps long names and codes without fixed narrow columns or duplicate mobile actions",()=>{
    const name="LongUnbrokenDisciplineName".repeat(3),code="LONG-DISCIPLINE-CODE-0001";
    const {container}=render(<DocumentCategoryManagement organisationId="organisation-A" categories={[{...categories[0],name,code}]}/>);
    const heading=screen.getByRole("heading",{name});expect(heading.className).toContain("[overflow-wrap:anywhere]");
    expect(screen.getByText(code).className).toContain("[overflow-wrap:anywhere]");
    const button=screen.getByRole("button",{name:`Disable ${name} discipline`});
    expect(button.className).toContain("min-h-11");expect(button.className).toContain("w-full");expect(button.className).toContain("focus-visible:outline-[#10243e]");
    button.focus();expect(document.activeElement).toBe(button);
    expect(container.querySelectorAll("form")).toHaveLength(1);expect(container.querySelector('[class*="min-w-["]')).toBeNull();
  });
  it("shows a genuine empty state without rendering a mutation control",()=>{
    render(<DocumentCategoryManagement organisationId="organisation-A" categories={[]}/>);
    expect(screen.getByText("No document categories are registered yet.")).toBeTruthy();expect(screen.getByText("0 categories")).toBeTruthy();expect(screen.queryByRole("button")).toBeNull();
  });
  it.each([true,false])("preserves the exact toggle action and payload for active=%s",async is_active=>{
    render(<DocumentCategoryManagement organisationId="organisation-A" categories={[{...categories[0],is_active}]}/>);
    const button=screen.getByRole("button",{name:`${is_active?"Disable":"Enable"} Process engineering discipline`});
    expect(button.getAttribute("type")).toBe("submit");expect(button.hasAttribute("data-preview-safe")).toBe(false);
    await act(async()=>{fireEvent.submit(button.closest("form")!);});
    expect(toggleDocumentCategory).toHaveBeenCalledTimes(1);
    const payload=vi.mocked(toggleDocumentCategory).mock.calls[0][0];
    expect(Object.fromEntries(payload)).toEqual({organisationId:"organisation-A",categoryId:"process",isActive:String(!is_active)});
  });
  it("exposes pending feedback only for the submitted category without changing the other action",async()=>{
    let finish!:()=>void;vi.mocked(toggleDocumentCategory).mockImplementation(()=>new Promise<void>(resolve=>{finish=resolve;}));
    render(<DocumentCategoryManagement organisationId="organisation-A" categories={categories}/>);
    await act(async()=>{fireEvent.submit(screen.getByRole("button",{name:"Disable Process engineering discipline"}).closest("form")!);});
    const saving=screen.getByRole("button",{name:"Updating Process engineering"}) as HTMLButtonElement;
    expect(saving.disabled).toBe(true);expect(saving.getAttribute("aria-busy")).toBe("true");
    expect(within(saving.closest("form")!).getByRole("status").textContent).toContain("Updating Process engineering availability");
    expect((screen.getByRole("button",{name:"Enable Drawing document type"}) as HTMLButtonElement).disabled).toBe(false);
    await act(async()=>{finish();});
    expect((screen.getByRole("button",{name:"Disable Process engineering discipline"}) as HTMLButtonElement).disabled).toBe(false);
  });
});
