import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProjectSearch} from "./project-search";

const endpoint="/api/v1/organisations/org/projects/project/search",basePath="/app/org/projects/project";
const evidence={chunk_id:"chunk-1",document_id:"document-1",revision_id:"revision-1",document_number:"DOC-1",title:"Export line design basis",revision_code:"IFD",discipline:"Process",document_type:"Report",issue_status:"Issued for Design",locator_type:"page",page_number:4,paragraph_number:null,sheet_name:null,cell_range:null,content:"The export line design pressure is recorded here.",score:0.9};
const response=(payload:unknown,ok=true)=>({ok,json:async()=>payload}) as Response;
function searchForm(){return screen.getByRole("form",{name:"Search project evidence"});}
function enterSearch(){fireEvent.change(screen.getByRole("searchbox",{name:"Search project evidence"}),{target:{value:"design pressure"}});}
beforeEach(()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response({mode:"hybrid_search",results:[evidence]})));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe("Engineering Search accessibility and reflow",()=>{
  it.each(["hybrid_search","full_text"])("shows relevance ranks instead of treating %s scores as confidence percentages",async mode=>{
    const supplied=[{...evidence,score:2.84},{...evidence,chunk_id:"chunk-2",document_number:"DOC-2",score:0.9},{...evidence,chunk_id:"chunk-3",document_number:"DOC-3",score:-0.1}];
    vi.mocked(fetch).mockResolvedValue(response({mode,results:supplied}));
    render(<ProjectSearch endpoint={endpoint} basePath={basePath} readOnly={mode==="full_text"}/>);
    enterSearch();fireEvent.submit(searchForm());
    await screen.findByLabelText("Search relevance rank 1");
    const cards=within(screen.getByRole("region",{name:"Search results"})).getAllByRole("article");
    expect(cards).toHaveLength(3);
    cards.forEach((card,index)=>{
      expect(within(card).getByLabelText(`Search relevance rank ${index+1}`).textContent).toBe(`Relevance #${index+1}`);
      expect(card.textContent).toContain(supplied[index].document_number);
      expect(card.textContent).not.toMatch(/%\s*match/);
    });
    expect(screen.queryByText(/284%|90%|NaN|Infinity/)).toBeNull();
  });

  it("keeps every field visibly labelled and avoids the cramped four-column tablet layout",()=>{
    render(<ProjectSearch endpoint={endpoint} basePath={basePath}/>);
    const query=screen.getByRole("searchbox",{name:"Search project evidence"}) as HTMLInputElement;
    const discipline=screen.getByRole("textbox",{name:"Discipline (optional)"}) as HTMLInputElement;
    const documentType=screen.getByRole("textbox",{name:"Document type (optional)"}) as HTMLInputElement;
    for(const input of [query,discipline,documentType]){
      const label=document.querySelector(`label[for="${input.id}"]`)!;
      expect(label).toBeTruthy();expect(label.className).not.toContain("sr-only");
      expect(input.className).toContain("min-h-11");expect(input.className).toContain("min-w-0");
    }
    expect(query.required).toBe(true);expect(query.minLength).toBe(2);expect(query.maxLength).toBe(500);
    expect(discipline.required).toBe(false);expect(documentType.required).toBe(false);
    expect(searchForm().className).toContain("sm:grid-cols-2");
    expect(searchForm().className).toContain("xl:grid-cols-");
    expect(searchForm().className).not.toContain("md:grid-cols-");
    expect(query.closest("label")?.className).toContain("sm:col-span-2");
    expect(screen.getByRole("button",{name:"Search evidence"}).className).toContain("min-h-11");
  });

  it("preserves the POST endpoint and every existing search filter",async()=>{
    render(<ProjectSearch endpoint={endpoint} basePath={basePath}/>);enterSearch();
    fireEvent.change(screen.getByLabelText("Discipline (optional)"),{target:{value:"Process"}});
    fireEvent.change(screen.getByLabelText("Document type (optional)"),{target:{value:"Report"}});
    fireEvent.submit(searchForm());
    await screen.findByRole("article",{name:evidence.title});
    expect(fetch).toHaveBeenCalledWith(endpoint,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:"design pressure",discipline:"Process",documentType:"Report"})});
    expect(screen.getByRole("status").textContent).toBe("1 evidence match.");
  });

  it("retains the read-only preview's GET-only search and preview-safe marker",async()=>{
    render(<ProjectSearch endpoint={endpoint} basePath={basePath} readOnly/>);enterSearch();
    fireEvent.change(screen.getByLabelText("Discipline (optional)"),{target:{value:"Electrical"}});
    fireEvent.submit(searchForm());await screen.findByRole("article",{name:evidence.title});
    expect(searchForm().hasAttribute("data-preview-safe")).toBe(true);
    expect(fetch).toHaveBeenCalledWith(`${endpoint}?query=design+pressure&discipline=Electrical&documentType=`,{cache:"no-store"});
  });

  it("names results and distinguishes each cited-source link while preserving source destinations",async()=>{
    const second={...evidence,chunk_id:"chunk-2",document_id:"document-2",revision_id:"revision-2",document_number:"DOC-2",title:"Equipment list",page_number:null,sheet_name:"Equipment",cell_range:"A1:D5"};
    vi.mocked(fetch).mockResolvedValue(response({mode:"full_text",results:[evidence,second]}));
    render(<ProjectSearch endpoint={endpoint} basePath={basePath}/>);enterSearch();fireEvent.submit(searchForm());
    const results=screen.getByRole("region",{name:"Search results"});
    const first=await within(results).findByRole("article",{name:evidence.title});
    const firstLink=within(first).getByRole("link",{name:"Open cited source: DOC-1, revision IFD, Page 4"});
    expect(firstLink.getAttribute("href")).toBe(`${basePath}/documents/document-1/revisions/revision-1/preview`);
    expect(firstLink.className).toContain("min-h-11");
    expect(within(results).getByRole("link",{name:"Open cited source: DOC-2, revision IFD, Equipment A1:D5"}).getAttribute("href")).toBe(`${basePath}/documents/document-2/revisions/revision-2/preview`);
  });

  it("wraps long result identities and evidence instead of forcing them outside the result card",async()=>{
    const longTitle="LongEngineeringDocumentTitle".repeat(12),longContent="LongEvidenceIdentifier".repeat(20);
    vi.mocked(fetch).mockResolvedValue(response({mode:"full_text",results:[{...evidence,title:longTitle,content:longContent}]}));
    render(<ProjectSearch endpoint={endpoint} basePath={basePath}/>);enterSearch();fireEvent.submit(searchForm());
    const result=await screen.findByRole("article",{name:longTitle});
    expect(result.className).toContain("min-w-0");
    for(const element of [within(result).getByRole("heading",{name:longTitle}),within(result).getByText(longContent)]){
      expect(element.className).toContain("[overflow-wrap:anywhere]");expect(element.className).not.toContain("truncate");
    }
  });

  it("announces pending searches and returns an accessible empty result without clearing entered filters",async()=>{
    let finish!:(value:Response)=>void;
    vi.mocked(fetch).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    render(<ProjectSearch endpoint={endpoint} basePath={basePath}/>);enterSearch();fireEvent.submit(searchForm());
    expect(searchForm().getAttribute("aria-busy")).toBe("true");
    expect(screen.getByRole("status").textContent).toBe("Searching authorised project evidence…");
    expect((screen.getByRole("button",{name:"Searching…"}) as HTMLButtonElement).disabled).toBe(true);
    await act(async()=>finish(response({mode:"full_text",results:[]})));
    expect(searchForm().getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("status").textContent).toBe("No authorised evidence matched this search.");
    expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("design pressure");
  });

  it("keeps service errors visible and ready to retry without changing the search request",async()=>{
    vi.mocked(fetch).mockResolvedValue(response({error:{message:"Evidence search is temporarily unavailable."}},false));
    render(<ProjectSearch endpoint={endpoint} basePath={basePath}/>);enterSearch();fireEvent.submit(searchForm());
    await waitFor(()=>expect(screen.getByRole("status").textContent).toBe("Evidence search is temporarily unavailable."));
    expect((screen.getByRole("button",{name:"Search evidence"}) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByRole("article")).toBeNull();
  });
});
