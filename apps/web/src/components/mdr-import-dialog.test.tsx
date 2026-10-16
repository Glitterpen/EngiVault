import {cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {MdrImportDialog} from "./mdr-import-dialog";

function workbookPreview(count=32,invalidRows:number[]=[]){
  const rows=Array.from({length:count},(_,index)=>({row_number:index+2,document_number:`DOC-${index+1}`,title:`Deliverable ${index+1}`,discipline:"Electrical",document_type:"Drawing",planned_submission_date:"2026-11-02",is_valid:!invalidRows.includes(index+2),errors:invalidRows.includes(index+2)?[`Correct Excel row ${index+2}.`]:[]}));
  return {sheetName:"MDR",rowCount:count,validCount:count-invalidRows.length,errorCount:invalidRows.length,canImport:invalidRows.length===0,rows};
}
function openAndChoose(){
  render(<MdrImportDialog organisationId="org" projectId="project"/>);
  fireEvent.click(screen.getByRole("button",{name:"Import Excel"}));
  fireEvent.change(screen.getByLabelText("Choose Excel file"),{target:{files:[new File(["synthetic workbook"],"MDR.xlsx") ]}});
  return screen.getByRole("dialog",{name:"Import Master Document Register from Excel"});
}
beforeEach(()=>{
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;}});
  vi.stubGlobal("fetch",vi.fn());
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe("MDR workbook validation preview",()=>{
  it("keeps workbook selection named and keyboard-focusable through its visible picker",()=>{
    openAndChoose();
    const input=screen.getByLabelText("Choose Excel file") as HTMLInputElement;
    expect(input.type).toBe("file");expect(input.tabIndex).toBe(0);expect(input.disabled).toBe(false);
    expect(input.closest(".ev-file-picker")).not.toBeNull();
    const selected=document.getElementById(input.getAttribute("aria-describedby")!);
    expect(selected?.textContent).toBe("MDR.xlsx");expect(selected?.getAttribute("aria-live")).toBe("polite");
    expect(screen.getByRole("button",{name:"Close Excel import"}).classList.contains("size-11")).toBe(true);
  });
  it("opens the errors view with errors beyond the first fifteen rows, while import stays blocked",async()=>{
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>workbookPreview(500,[501])} as Response);
    const dialog=openAndChoose();
    fireEvent.click(within(dialog).getByRole("button",{name:"Preview workbook"}));
    expect(await screen.findByText("Correct Excel row 501.")).toBeTruthy();
    expect(screen.getByRole("button",{name:"Need correction (1)"}).getAttribute("aria-pressed")).toBe("true");
    expect((screen.getByRole("button",{name:"Import 499 documents"}) as HTMLButtonElement).disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(vi.mocked(fetch).mock.calls[0][1]?.method).toBe("POST");
  });
  it("pages through every row in workbook order and resets the page when switching views",async()=>{
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>workbookPreview(32,[32,33])} as Response);
    openAndChoose();fireEvent.click(screen.getByRole("button",{name:"Preview workbook"}));
    await screen.findByText("Correct Excel row 33.");
    fireEvent.click(screen.getByRole("button",{name:"All rows (32)"}));
    expect(screen.getByText("DOC-1")).toBeTruthy();expect(screen.queryByText("DOC-16")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Next rows"}));
    expect(screen.getByText("DOC-16")).toBeTruthy();expect(screen.queryByText("DOC-1")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Next rows"}));
    expect(screen.getByText("DOC-32")).toBeTruthy();expect((screen.getByRole("button",{name:"Next rows"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Need correction (2)"}));
    expect(screen.getByText("Correct Excel row 32.")).toBeTruthy();
    expect(screen.getByText("Showing 1–2 of 2 rows · Page 1 of 1")).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Next rows"})).toBeNull();
  });
  it("paginates error-only results too, without omitting later corrections",async()=>{
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>workbookPreview(32,Array.from({length:20},(_,i)=>i+14))} as Response);
    openAndChoose();fireEvent.click(screen.getByRole("button",{name:"Preview workbook"}));
    await screen.findByText("Correct Excel row 14.");
    expect(screen.queryByText("Correct Excel row 33.")).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Next rows"}));
    expect(screen.getByText("Correct Excel row 33.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Previous rows"}));
    expect(screen.getByText("Correct Excel row 14.")).toBeTruthy();
  });
  it("imports all validated rows, not only the visible page, and preserves the preview after a failed import",async()=>{
    const preview=workbookPreview();
    vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>preview} as Response).mockResolvedValueOnce({ok:false,json:async()=>({error:{message:"Import could not finish. Retry shortly."}})} as Response);
    openAndChoose();fireEvent.click(screen.getByRole("button",{name:"Preview workbook"}));
    fireEvent.click(await screen.findByRole("button",{name:"Import 32 documents"}));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent","Import could not finish. Retry shortly.");
    const [,init]=vi.mocked(fetch).mock.calls[1];
    expect(init?.method).toBe("PUT");expect(JSON.parse(String(init?.body))).toEqual({rows:preview.rows});
    expect((screen.getByRole("button",{name:"Import 32 documents"}) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText(/documents were added/)).toBeNull();
  });
  it("announces preview failures safely and allows the same workbook to be retried",async()=>{
    vi.mocked(fetch).mockRejectedValueOnce(new Error("postgres internal schema failed")).mockResolvedValueOnce({ok:true,json:async()=>workbookPreview(1)} as Response);
    openAndChoose();fireEvent.click(screen.getByRole("button",{name:"Preview workbook"}));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent","The workbook could not be previewed.");
    fireEvent.click(screen.getByRole("button",{name:"Preview workbook"}));
    await waitFor(()=>expect((screen.getByRole("button",{name:"Import 1 documents"}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
