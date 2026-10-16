import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
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
