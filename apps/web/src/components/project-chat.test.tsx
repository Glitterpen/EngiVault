import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProjectChat} from "./project-chat";

const revisions=[{id:"revision",document_id:"document",revision_code:"IFR",documents:{document_number:"DOC-1",title:"Design basis"}}];
const response=(payload:unknown,ok=true)=>({ok,json:async()=>payload}) as Response;
const answer={answer:"The design pressure is recorded in the design basis.",grounded:true,citations:[]};
function questionForm(){return screen.getByRole("textbox",{name:"Ask a question about the selected project evidence"}).closest("form")!;}
beforeEach(()=>{vi.stubGlobal("fetch",vi.fn().mockResolvedValueOnce(response({session:{id:"session"}})).mockResolvedValueOnce(response(answer)));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

describe("Ask EngiCite result feedback",()=>{
  it("keeps a successful answer successful after the async request and clears only the submitted question",async()=>{
    render(<ProjectChat organisationId="org" projectId="project" revisions={revisions}/>);
    const input=screen.getByRole("textbox") as HTMLTextAreaElement;
    fireEvent.change(input,{target:{value:"What is the design pressure?"}});fireEvent.submit(questionForm());
    expect(await screen.findByText(answer.answer)).toBeTruthy();
    await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("Answer verified against retrieved project evidence."));
    expect(input.value).toBe("");expect(screen.queryByText("Question failed.")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).revisionIds).toEqual(["revision"]);
  });
  it("keeps the question available to retry when the service rejects it",async()=>{
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(response({session:{id:"session"}})).mockResolvedValueOnce(response({error:{message:"Evidence lookup is temporarily unavailable."}},false));
    render(<ProjectChat organisationId="org" projectId="project" revisions={revisions}/>);
    const input=screen.getByRole("textbox") as HTMLTextAreaElement;fireEvent.change(input,{target:{value:"Find the design pressure"}});fireEvent.submit(questionForm());
    await waitFor(()=>expect(screen.getByRole("status").textContent).toContain("Evidence lookup is temporarily unavailable."));
    expect(input.value).toBe("Find the design pressure");expect(screen.queryByText(answer.answer)).toBeNull();
  });
  it("does not erase a new draft entered while an answer is pending",async()=>{
    let finish!:(value:Response)=>void;
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(response({session:{id:"session"}})).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    render(<ProjectChat organisationId="org" projectId="project" revisions={revisions}/>);
    const input=screen.getByRole("textbox") as HTMLTextAreaElement;fireEvent.change(input,{target:{value:"First question"}});fireEvent.submit(questionForm());
    await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
    fireEvent.change(input,{target:{value:"Next draft question"}});
    await act(async()=>finish(response(answer)));
    expect(await screen.findByText(answer.answer)).toBeTruthy();expect(input.value).toBe("Next draft question");
  });
});

describe("Ask EngiCite accessibility and reflow",()=>{
  it("provides a page heading, visible question label, tablet-safe composer and high-contrast dark-panel focus treatment",()=>{
    const {container}=render(<ProjectChat organisationId="org" projectId="project" revisions={revisions}/>);
    expect(screen.getByRole("heading",{level:1,name:"Ask EngiCite"})).toBeTruthy();
    const input=screen.getByRole("textbox",{name:"Ask a question about the selected project evidence"});
    const label=document.querySelector(`label[for="${input.id}"]`)!;
    expect(label.className).not.toContain("sr-only");
    expect(input.parentElement?.className).toContain("xl:flex-row");
    expect(input.parentElement?.className).not.toContain("sm:flex-row");
    expect(input.className).toContain("min-w-0");
    expect(input.className).toContain("text-base");
    expect(input.className).toContain("sm:text-sm");
    const submit=screen.getByRole("button",{name:"Ask EngiCite"});
    expect(submit.className).toContain("bg-[#b94d20]");
    expect(submit.className).not.toContain("bg-[#ed7138]");
    expect(container.firstElementChild?.className).toContain("[--focus:#ffffff]");
    for(const selector of ["a","button","summary","input","textarea"])expect(container.firstElementChild?.className).toContain(`[&_${selector}:focus-visible]:outline-white`);
    expect(screen.getByRole("form",{name:"Ask EngiCite"}).getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("log",{name:"Questions and answers"}).getAttribute("aria-relevant")).toBe("additions");
  });

  it("keeps revision identities readable and preserves selection scope and its lock after the first question",async()=>{
    const longNumber="PROJECT-DISCIPLINE-DOCUMENT-NUMBER-".repeat(5),longTitle="LongEngineeringDocumentTitle".repeat(8);
    const second={id:"revision-2",document_id:"document-2",revision_code:"IFD",documents:{document_number:longNumber,title:longTitle}};
    const {container}=render(<ProjectChat organisationId="org" projectId="project" revisions={[...revisions,second]}/>);
    fireEvent.click(container.querySelector("details > summary")!);
    fireEvent.focus(screen.getByRole("button",{name:"Authorised revision scope"}));
    expect(screen.getByRole("tooltip").textContent).toBe("Select the revisions to use before asking a question. This selection locks after your first question.");
    fireEvent.keyDown(screen.getByRole("button",{name:"Authorised revision scope"}),{key:"Escape"});
    const scope=screen.getByRole("group",{name:"Ready revisions"});
    expect(scope.className).toContain("xl:grid-cols-2");expect(scope.className).not.toContain("md:grid-cols-2");
    expect(within(scope).getByText(longTitle).className).toContain("[overflow-wrap:anywhere]");
    expect(within(scope).getByText(longTitle).className).not.toContain("truncate");
    for(const name of ["Select all","Clear"])expect(screen.getByRole("button",{name}).className).toContain("min-h-11");
    fireEvent.click(screen.getByRole("button",{name:"Clear"}));
    expect(within(scope).getAllByRole("checkbox").every(input=>!(input as HTMLInputElement).checked)).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Select all"}));
    fireEvent.click(within(scope).getAllByRole("checkbox")[0]);
    const question=screen.getByRole("textbox");fireEvent.change(question,{target:{value:"Find the design pressure"}});fireEvent.submit(questionForm());
    await screen.findByText(answer.answer);
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body)).revisionIds).toEqual(["revision-2"]);
    expect(within(scope).getAllByRole("checkbox").every(input=>(input as HTMLInputElement).disabled)).toBe(true);
  });

  it("keeps citation links distinguishable, readable and touch-sized without changing their exact source routes",async()=>{
    const citation={label:1,documentId:"document",revisionId:"revision",documentNumber:"DOC-1",title:"Long document title ".repeat(8),revision:"IFD",page:4,sheet:null,cellRange:null,excerpt:"Evidence excerpt"};
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(response({session:{id:"session"}})).mockResolvedValueOnce(response({...answer,citations:[citation]}));
    render(<ProjectChat organisationId="org" projectId="project" revisions={revisions}/>);
    fireEvent.change(screen.getByRole("textbox"),{target:{value:"Find the cited source"}});fireEvent.submit(questionForm());
    const citationLink=await screen.findByRole("link",{name:"Open cited source 1: DOC-1, revision IFD, Page 4"});
    expect(citationLink.getAttribute("href")).toBe("/app/org/projects/project/documents/document/revisions/revision/preview#page=4");
    expect(citationLink.className).toContain("min-h-11");expect(citationLink.className).toContain("text-xs");expect(citationLink.className).not.toContain("text-[10px]");
    const sources=screen.getByRole("region",{name:"Sources for the latest answer"});
    const sourceLink=within(sources).getByRole("link");expect(sourceLink.getAttribute("href")).toBe(citationLink.getAttribute("href"));
    const title=within(sourceLink).getByText(citation.title.trim());expect(title.className).not.toContain("truncate");expect(title.className).toContain("[overflow-wrap:anywhere]");
  });

  it("keeps long questions and answers within the conversation and announces request progress",async()=>{
    const longQuestion="LongEngineeringQuestionIdentifier".repeat(10),longAnswer="LongEngineeringAnswerIdentifier".repeat(20);
    let finish!:(value:Response)=>void;
    vi.mocked(fetch).mockReset().mockResolvedValueOnce(response({session:{id:"session"}})).mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
    render(<ProjectChat organisationId="org" projectId="project" revisions={revisions}/>);
    fireEvent.change(screen.getByRole("textbox"),{target:{value:longQuestion}});fireEvent.submit(questionForm());
    await waitFor(()=>expect(fetch).toHaveBeenCalledTimes(2));
    expect(questionForm().getAttribute("aria-busy")).toBe("true");expect(screen.getByRole("status").textContent).toContain("Retrieving authorised project evidence");
    await act(async()=>finish(response({...answer,answer:longAnswer})));
    const log=screen.getByRole("log",{name:"Questions and answers"});
    for(const content of [longQuestion,longAnswer])expect(within(log).getByText(content).className).toContain("[overflow-wrap:anywhere]");
    expect(questionForm().getAttribute("aria-busy")).toBe("false");
  });
});
