// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProjectTemplatePack} from "./project-template-pack";
vi.mock("@/lib/supabase/browser",()=>({createClient:vi.fn()}));
const pack={current:{id:"pack",filename:"Approved-templates.zip",byteSize:1024,fileCount:4,publishedAt:"2026-09-10"},pending:null};
beforeEach(()=>vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>pack})));
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
describe("project template pack",()=>{
  it("downloads all files with one ZIP link and gives members no upload controls",async()=>{
    render(<ProjectTemplatePack organisationId="org" projectId="project"/>);
    const link=await screen.findByRole("link",{name:"Download all templates (.zip)"});
    expect(link.getAttribute("href")).toBe("/api/v1/organisations/org/projects/project/templates/download");
    expect(screen.queryByRole("button",{name:/Upload/})).toBeNull();
  });
  it("lets the manager replace an existing pack",async()=>{
    render(<ProjectTemplatePack organisationId="org" projectId="project" canManage/>);
    expect(await screen.findByRole("button",{name:"Upload replacement ZIP"})).toBeTruthy();
  });
  it("shows a truthful empty state",async()=>{
    vi.mocked(fetch).mockResolvedValue({ok:true,json:async()=>({current:null,pending:null})} as Response);
    render(<ProjectTemplatePack organisationId="org" projectId="project"/>);
    expect(await screen.findByText("No template pack published yet.")).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("keeps the download during scan failures and allows retry",async()=>{
    vi.mocked(fetch).mockImplementation(async(_url,init)=>({ok:!init?.method,json:async()=>init?.method?{error:{message:"Scan unavailable"}}:{...pack,pending:{id:"pending",filename:"New.zip"}}} as Response));
    render(<ProjectTemplatePack organisationId="org" projectId="project" canManage/>);
    fireEvent.click(await screen.findByRole("button",{name:"Retry security checks"}));
    expect(await screen.findByRole("alert")).toHaveProperty("textContent","Scan unavailable");
    await waitFor(()=>expect(screen.getByRole("link",{name:/Download all/})).toBeTruthy());
  });
});
