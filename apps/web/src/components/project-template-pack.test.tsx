// @vitest-environment jsdom
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProjectTemplatePack} from "./project-template-pack";
import {createClient} from "@/lib/supabase/browser";
vi.mock("@/lib/supabase/browser",()=>({createClient:vi.fn()}));
const pack={current:{id:"pack",filename:"Approved-templates.zip",byteSize:1024,fileCount:4,publishedAt:"2026-09-10"},pending:null};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>pack}));});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

function selectedZip(type:string){
  const bytes=new Uint8Array([0x50,0x4b,3,4,0,128,255]);
  const file=new File([bytes],"TEMPLATE.zip",{type,lastModified:1234});
  // jsdom does not implement Blob.arrayBuffer; the browser does.
  Object.defineProperty(file,"arrayBuffer",{value:async()=>bytes.buffer});
  return {file,bytes};
}
function readBytes(blob:Blob):Promise<Uint8Array>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror=()=>reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}
function prepareUpload(upload:ReturnType<typeof vi.fn>){
  const from=vi.fn().mockReturnValue({uploadToSignedUrl:upload});
  vi.mocked(createClient).mockReturnValue({storage:{from}} as unknown as ReturnType<typeof createClient>);
  const digest=vi.fn().mockResolvedValue(new Uint8Array(32).fill(1).buffer);
  vi.stubGlobal("crypto",{subtle:{digest}});
  vi.mocked(fetch).mockImplementation(async(url,init)=>({ok:true,json:async()=>
    init?.method?(String(url).endsWith("/complete")?{state:"ready"}:{id:"new-pack",path:"org/project/new-pack/upload.zip",token:"signed-upload"}):pack} as Response));
  return {from,digest};
}
describe("project template pack",()=>{
  it("ends the loading state after a read failure and retries only the read without publishing",async()=>{
    vi.mocked(fetch).mockRejectedValueOnce(new Error("postgres secret diagnostics")).mockResolvedValueOnce({ok:true,json:async()=>pack} as Response);
    render(<ProjectTemplatePack organisationId="org" projectId="project" canManage/>);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent","Project templates could not be loaded. Please retry.");
    expect(screen.queryByText("Loading project templates…")).toBeNull();
    expect(screen.queryByText("No template pack published yet.")).toBeNull();
    expect(screen.getByText("Project template availability could not be confirmed.")).toBeTruthy();
    expect((screen.getByRole("button",{name:"Upload template ZIP"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button",{name:"Retry loading templates"}).hasAttribute("data-preview-safe")).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Retry loading templates"}));
    expect(await screen.findByRole("link",{name:"Download all templates (.zip)"})).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(vi.mocked(fetch).mock.calls.every(([,init])=>!init?.method)).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it("announces a failed response rather than an empty pack and re-enables retry",async()=>{
    vi.mocked(fetch).mockResolvedValue({ok:false,json:async()=>({error:{message:"Templates are temporarily unavailable."}})} as Response);
    render(<ProjectTemplatePack organisationId="org" projectId="project"/>);
    expect(await screen.findByRole("alert")).toHaveProperty("textContent","Templates are temporarily unavailable.");
    expect(screen.queryByText("Loading project templates…")).toBeNull();expect(screen.queryByText("No template pack published yet.")).toBeNull();
    expect((screen.getByRole("button",{name:"Retry loading templates"}) as HTMLButtonElement).disabled).toBe(false);
  });
  it("does not carry a previous project's template details into a failed new project read",async()=>{
    vi.mocked(fetch).mockResolvedValueOnce({ok:true,json:async()=>pack} as Response).mockRejectedValueOnce(new Error("Connection unavailable"));
    const {rerender}=render(<ProjectTemplatePack organisationId="org" projectId="first"/>);
    await screen.findByRole("link",{name:"Download all templates (.zip)"});
    rerender(<ProjectTemplatePack organisationId="org" projectId="second"/>);
    await screen.findByRole("alert");
    expect(screen.queryByText(/Approved-templates.zip/)).toBeNull();
    expect(screen.queryByRole("link",{name:"Download all templates (.zip)"})).toBeNull();
    expect(screen.queryByText("Loading project templates…")).toBeNull();
  });
  it("does not overlap a read retry with publication security checks",async()=>{
    const pending={...pack,pending:{id:"pending",filename:"New.zip"}};
    let finishRead!:(value:Response)=>void;
    vi.mocked(fetch).mockReset()
      .mockResolvedValueOnce({ok:true,json:async()=>pending} as Response)
      .mockResolvedValueOnce({ok:false,json:async()=>({error:{message:"Scan unavailable"}})} as Response)
      .mockResolvedValueOnce({ok:true,json:async()=>pending} as Response)
      .mockImplementationOnce(()=>new Promise(resolve=>{finishRead=resolve;}));
    render(<ProjectTemplatePack organisationId="org" projectId="project" canManage/>);
    fireEvent.click(await screen.findByRole("button",{name:"Retry security checks"}));
    await screen.findByRole("alert");
    const readRetry=await screen.findByRole("button",{name:"Retry loading templates"});
    await waitFor(()=>expect((readRetry as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(readRetry);
    const securityRetry=screen.getByRole("button",{name:"Retry security checks"}) as HTMLButtonElement;
    expect(securityRetry.hasAttribute("data-preview-safe")).toBe(false);
    expect(securityRetry.disabled).toBe(true);fireEvent.click(securityRetry);
    expect(vi.mocked(fetch).mock.calls.filter(([,init])=>init?.method==="POST")).toHaveLength(1);
    finishRead({ok:true,json:async()=>pack} as Response);
    await waitFor(()=>expect(screen.queryByRole("button",{name:"Retry security checks"})).toBeNull());
    expect(screen.getByRole("link",{name:/Download all/})).toBeTruthy();
  });
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
  it.each(["application/x-zip-compressed","","application/octet-stream","application/zip"])("uploads identical ZIP bytes with a canonical MIME type for %j",async type=>{
    const upload=vi.fn().mockResolvedValue({error:null});
    const {from,digest}=prepareUpload(upload);
    const {file,bytes}=selectedZip(type);
    render(<ProjectTemplatePack organisationId="org" projectId="project" canManage/>);
    const button=await screen.findByRole("button",{name:"Upload replacement ZIP"});
    fireEvent.change(screen.getByLabelText("Approved template ZIP (up to 50 MB)"),{target:{files:[file]}});
    // jsdom's native required-file validation does not observe the injected FileList.
    fireEvent.submit(button.closest("form")!);
    await screen.findByText("Template ZIP published for the project team.");
    expect(from).toHaveBeenCalledWith("project-templates");
    expect(upload).toHaveBeenCalledWith("org/project/new-pack/upload.zip","signed-upload",expect.any(File),{contentType:"application/zip",upsert:false});
    const sent=upload.mock.calls[0][2] as File;
    expect(sent.type).toBe("application/zip");
    expect(sent.name).toBe(file.name);expect(sent.size).toBe(file.size);
    expect(sent.lastModified).toBe(file.lastModified);
    expect(await readBytes(sent)).toEqual(bytes);
    expect(digest).toHaveBeenCalledWith("SHA-256",bytes.buffer);
    const start=vi.mocked(fetch).mock.calls.find(([url,init])=>!String(url).endsWith("/complete")&&init?.method==="POST");
    expect(JSON.parse(start![1]!.body as string)).toEqual({filename:file.name,size:bytes.length,sha256:"01".repeat(32)});
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/complete"),expect.objectContaining({body:JSON.stringify({id:"new-pack"})}));
  });
  it("does not start security checks after a failed file upload and preserves the published download",async()=>{
    const upload=vi.fn().mockResolvedValue({error:{message:"Storage rejected upload"}});
    prepareUpload(upload);
    render(<ProjectTemplatePack organisationId="org" projectId="project" canManage/>);
    const button=await screen.findByRole("button",{name:"Upload replacement ZIP"});
    fireEvent.change(screen.getByLabelText("Approved template ZIP (up to 50 MB)"),{target:{files:[selectedZip("application/x-zip-compressed").file]}});
    fireEvent.submit(button.closest("form")!);
    expect((await screen.findByRole("alert")).textContent).toContain("Select the ZIP and upload it again before retrying security checks.");
    expect(vi.mocked(fetch).mock.calls.some(([url])=>String(url).endsWith("/complete"))).toBe(false);
    expect(screen.getByRole("link",{name:/Download all/})).toBeTruthy();
    expect(screen.queryByText("Template ZIP published for the project team.")).toBeNull();
  });
  it("displays re-upload instructions for missing bytes without claiming publication succeeded",async()=>{
    const message="The ZIP upload did not complete. Select the ZIP and upload it again before retrying security checks.";
    vi.mocked(fetch).mockImplementation(async(_url,init)=>({ok:!init?.method,json:async()=>init?.method?{error:{message}}:{...pack,pending:{id:"pending",filename:"TEMPLATE.zip"}}} as Response));
    render(<ProjectTemplatePack organisationId="org" projectId="project" canManage/>);
    fireEvent.click(await screen.findByRole("button",{name:"Retry security checks"}));
    expect((await screen.findByRole("alert")).textContent).toBe(message);
    expect(screen.getByRole("link",{name:/Download all/})).toBeTruthy();
    expect(screen.queryByText("Template ZIP published for the project team.")).toBeNull();
  });
});
