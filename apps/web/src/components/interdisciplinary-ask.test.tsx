import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {InterdisciplinaryAsk} from "./interdisciplinary-ask";

const props={organisationId:"org",projectId:"project",discipline:"Electrical",canAsk:true,preview:false};
const source={label:1,documentId:"document",revisionId:"revision",documentNumber:"DOC-001",title:"Design basis",revision:"D01",issueStatus:"Issued for Design (IFD)",submittedAt:"2026-10-01T12:00:00Z",page:4,sheet:null,cellRange:null,excerpt:"Design pressure is 50 barg."};
const answer={mode:"answer",question:"What is the design pressure?",answer:"Design pressure is 50 barg [1].",grounded:true,sources:[source]};
const response=(body:unknown,ok=true)=>({ok,json:async()=>body}) as Response;
function submit(){fireEvent.change(screen.getByLabelText("Your question or search phrase"),{target:{value:"What is the design pressure?"}});fireEvent.submit(screen.getByRole("form",{name:"Search approved deliverable evidence"}));}
beforeEach(()=>vi.stubGlobal("fetch",vi.fn().mockResolvedValue(response(answer))));
afterEach(()=>{cleanup();vi.unstubAllGlobals()});

describe("inline approved deliverable questions",()=>{
  it("does not fetch or use AI on mount; labels the question and scopes",()=>{
    render(<InterdisciplinaryAsk {...props}/>);
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.getByRole("heading",{name:"Find an answer in approved deliverables"})).toBeTruthy();
    expect(screen.getByLabelText("Your question or search phrase").getAttribute("maxlength")).toBe("1000");
    expect(screen.getByLabelText("Issue purpose")).toBeTruthy();expect(screen.getByLabelText("Search mode")).toBeTruthy();
  });
  it("asks without selecting/opening files and renders a referenced answer in the same interface",async()=>{
    render(<InterdisciplinaryAsk {...props}/>);submit();
    const result=await screen.findByRole("region",{name:"Approved deliverable search result"});
    expect(within(result).getByText(answer.answer)).toBeTruthy();expect(within(result).getByText(source.excerpt)).toBeTruthy();
    expect(within(result).getByRole("link",{name:"[1] DOC-001 · Rev D01"}).getAttribute("href")).toBe("/app/org/projects/project/interdisciplinary/revision");
    expect(within(result).getByText(/Page 4/)).toBeTruthy();
    const call=vi.mocked(fetch).mock.calls[0];expect(call[0]).toBe("/api/v1/organisations/org/projects/project/interdisciplinary/questions");
    expect(JSON.parse((call[1] as RequestInit).body as string)).toMatchObject({mode:"answer",question:answer.question,discipline:"Electrical",stage:""});
  });
  it("offers no-AI excerpt search and keeps results visibly distinct from generated answers",async()=>{
    vi.mocked(fetch).mockResolvedValue(response({...answer,mode:"search",grounded:false,answer:"Matching excerpts only."}));
    render(<InterdisciplinaryAsk {...props}/>);
    fireEvent.change(screen.getByLabelText("Search mode"),{target:{value:"search"}});
    fireEvent.change(screen.getByLabelText("Issue purpose"),{target:{value:"IFD"}});submit();
    await screen.findByText("Matching excerpts · no AI answer");
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string)).toMatchObject({mode:"search",stage:"IFD"});
    expect(screen.getByText("Electrical · IFD")).toBeTruthy();
  });
  it("uses GET-only excerpt search in read-only previews and never enables an AI action",async()=>{
    vi.mocked(fetch).mockResolvedValue(response({...answer,mode:"search"}));
    render(<InterdisciplinaryAsk {...props} preview canAsk={false}/>);
    const form=screen.getByRole("form",{name:"Search approved deliverable evidence"});
    expect(form.getAttribute("method")).toBe("get");expect(form.hasAttribute("data-preview-safe")).toBe(true);
    expect((screen.getByLabelText("Search mode") as HTMLSelectElement).disabled).toBe(true);submit();
    await screen.findByRole("region",{name:"Approved deliverable search result"});
    const [url,options]=vi.mocked(fetch).mock.calls[0];expect(String(url)).toContain("?question=What+is+the+design+pressure%3F&discipline=Electrical&stage=");expect(options).toMatchObject({method:"GET",cache:"no-store"});expect(options).not.toHaveProperty("body");
  });
  it("keeps ordinary roles without AI permission on excerpt search",async()=>{
    vi.mocked(fetch).mockResolvedValue(response({...answer,mode:"search"}));
    render(<InterdisciplinaryAsk {...props} canAsk={false}/>);submit();
    await screen.findByRole("region",{name:"Approved deliverable search result"});
    expect(JSON.parse((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body as string).mode).toBe("search");
  });
  it("blocks double submission and announces pending work",async()=>{
    let finish!:(value:Response)=>void;vi.mocked(fetch).mockImplementation(()=>new Promise(resolve=>{finish=resolve}));
    render(<InterdisciplinaryAsk {...props}/>);submit();fireEvent.submit(screen.getByRole("form",{name:"Search approved deliverable evidence"}));
    expect(fetch).toHaveBeenCalledTimes(1);expect(screen.getByRole("status").textContent).toContain("Retrieving evidence");
    expect(screen.getByRole("form",{name:"Search approved deliverable evidence"}).getAttribute("aria-busy")).toBe("true");
    await act(async()=>finish(response(answer)));await screen.findByRole("region",{name:"Approved deliverable search result"});
  });
  it("keeps the question for retry and offers a visible error instead of a fabricated answer",async()=>{
    vi.mocked(fetch).mockResolvedValue(response({error:{message:"AI answers are temporarily unavailable. Use Search excerpts."}},false));
    render(<InterdisciplinaryAsk {...props}/>);submit();
    expect((await screen.findByRole("alert")).textContent).toContain("Search excerpts");
    expect(screen.queryByRole("region",{name:"Approved deliverable search result"})).toBeNull();
    expect((screen.getByLabelText("Your question or search phrase") as HTMLTextAreaElement).value).toBe(answer.question);
    await waitFor(()=>expect((screen.getByRole("button",{name:"Ask EngiCite"}) as HTMLButtonElement).disabled).toBe(false));
  });
  it("escapes model/source text instead of interpreting it as HTML",async()=>{
    vi.mocked(fetch).mockResolvedValue(response({...answer,answer:"<script>unsafe()</script>",sources:[{...source,excerpt:"<img src=x onerror=unsafe()>"}]}));
    const {container}=render(<InterdisciplinaryAsk {...props}/>);submit();
    await screen.findByText("<script>unsafe()</script>");expect(screen.getByText("<img src=x onerror=unsafe()>")).toBeTruthy();expect(container.querySelector("script,img")).toBeNull();
  });
  it("handles a non-JSON sign-in redirect or service response without showing parser diagnostics",async()=>{
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>{throw new SyntaxError("Unexpected token < private HTML")}} as unknown as Response);
    render(<InterdisciplinaryAsk {...props}/>);submit();
    const error=await screen.findByRole("alert");expect(error.textContent).toContain("Refresh this page, then retry");expect(error.textContent).not.toContain("Unexpected token");
    expect(screen.queryByRole("region",{name:"Approved deliverable search result"})).toBeNull();
  });
  it("aborts an in-flight request on unmount",()=>{
    vi.mocked(fetch).mockImplementation(()=>new Promise(()=>{}));
    const {unmount}=render(<InterdisciplinaryAsk {...props}/>);submit();
    const signal=(vi.mocked(fetch).mock.calls[0][1] as RequestInit).signal!;unmount();expect(signal.aborted).toBe(true);
  });
});
