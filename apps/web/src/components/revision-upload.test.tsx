import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {RevisionUpload} from "./revision-upload";
import {createClient} from "@/lib/supabase/browser";
import {TRANSMITTED_OVERRIDE_WARNING,TRANSMITTAL_DAILY_NOTICE} from "@/lib/submission-override";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/supabase/browser",()=>({createClient:vi.fn()}));
const fetchMock=vi.fn();
const props={organisationId:"org",projectId:"project",documentId:"doc",deliveryStage:"feed" as const,completedIssueStatuses:[]};
function prepare(){render(<RevisionUpload {...props}/>);fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"A"}});fireEvent.change(screen.getByRole("combobox"),{target:{value:"Issued for Review (IFR)"}});}
beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

async function readBytes(blob:Blob):Promise<ArrayBuffer>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onload=()=>resolve(reader.result as ArrayBuffer);
    reader.onerror=()=>reject(reader.error);
    reader.readAsArrayBuffer(blob);
  });
}

describe("DWG secure uploads",()=>{
  beforeEach(()=>{
    vi.spyOn(Blob.prototype,"arrayBuffer").mockImplementation(function(this:Blob){return readBytes(this);});
  });
  afterEach(()=>vi.restoreAllMocks());
  it.each(["","application/octet-stream","application/acad","image/vnd.dwg"].flatMap(type=>[false,true].map(native=>({type,native}))))("preserves bytes and canonicalises $type (native: $native)",async({type,native})=>{
    const upload=vi.fn().mockResolvedValue({error:null});
    vi.mocked(createClient).mockReturnValue({storage:{from:()=>({uploadToSignedUrl:upload})}} as unknown as ReturnType<typeof createClient>);
    const digest=vi.fn().mockResolvedValue(new Uint8Array(32).fill(1).buffer);
    vi.stubGlobal("crypto",{subtle:{digest}});
    fetchMock.mockResolvedValueOnce(Response.json({revisionId:"rev",path:"primary",token:"token",native:{path:"native",token:"native-token"}}))
      .mockResolvedValueOnce(Response.json({}));
    render(<RevisionUpload {...props} completedIssueStatuses={["Issued for Review (IFR)","Issued for Approval (IFA)"]}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"A"}});
    fireEvent.change(screen.getByRole("combobox"),{target:{value:native?"Issued for Design (IFD)":"Issued for Review (IFR)"}});
    const bytes=new Uint8Array([65,67,49,48,51,50,0,128,255]);
    const file=new File([bytes],"Drawing.DWG",{type,lastModified:1234});
    const select=(label:string,value:File)=>fireEvent.change(screen.getByLabelText(label),{target:{files:{0:value,length:1,item:()=>value}}});
    select("Controlled issue file",native?new File(["%PDF-1.7"],"Drawing.pdf",{type:"application/pdf"}):file);
    if(native)select("Native source file",file);
    fireEvent.click(screen.getByRole("button",{name:"Start secure upload"}));
    await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(2));
    const sent=upload.mock.calls[native?1:0][2] as File;
    expect(sent.type).toBe("image/vnd.dwg");
    expect(sent.name).toBe(file.name);expect(sent.size).toBe(file.size);expect(sent.lastModified).toBe(file.lastModified);
    expect(new Uint8Array(await readBytes(sent))).toEqual(bytes);
    expect(digest).toHaveBeenCalledWith("SHA-256",bytes.buffer);
    const metadata=JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(native?metadata.nativeFile:metadata).toMatchObject({mimeType:"image/vnd.dwg",sha256:"01".repeat(32)});
  });
  it("rejects a renamed non-DWG before creating an upload session",async()=>{
    prepare();
    const file=new File(["not a drawing"],"fake.DWG",{type:"application/octet-stream"});
    fireEvent.change(screen.getByLabelText("Controlled issue file"),{target:{files:{item:()=>file}}});
    fireEvent.click(screen.getByRole("button",{name:"Start secure upload"}));
    expect((await screen.findByRole("alert")).textContent).toContain("file contents do not match");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
describe("submission override checkbox",()=>{
  it("defaults off and displays the daily manual transmittal reminder",()=>{
    prepare();expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText(TRANSMITTAL_DAILY_NOTICE)).toBeTruthy();expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.mouseEnter(screen.getByRole("button",{name:"About submission overrides"}));
    expect(screen.getByRole("tooltip").textContent).toContain("same revision code");
  });
  it("checks the server before allowing a replacement",async()=>{
    fetchMock.mockResolvedValue(Response.json({allowed:true,revisionId:"rev",issueStatus:"Issued for Review (IFR)"}));
    prepare();fireEvent.click(screen.getByRole("checkbox"));
    expect((screen.getByRole("button",{name:"Start secure upload"}) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText(/replacement will require fresh security/);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining("revisionCode=A"),{cache:"no-store"});
    expect((screen.getByRole("button",{name:"Start secure upload"}) as HTMLButtonElement).disabled).toBe(false);
  });
  it("warns and blocks secure upload if transmitted",async()=>{
    fetchMock.mockResolvedValue(Response.json({allowed:false,message:TRANSMITTED_OVERRIDE_WARNING}));
    prepare();fireEvent.click(screen.getByRole("checkbox"));
    expect((await screen.findByRole("alert")).textContent).toBe(TRANSMITTED_OVERRIDE_WARNING);
    expect((screen.getByRole("button",{name:"Start secure upload"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect((screen.getByRole("button",{name:"Start secure upload"}) as HTMLButtonElement).disabled).toBe(false);
  });
  it("fails closed when the status check cannot be reached",async()=>{
    fetchMock.mockRejectedValue(new Error("offline"));prepare();fireEvent.click(screen.getByRole("checkbox"));
    await screen.findByText(/transmittal status could not be verified/);
    expect((screen.getByRole("button",{name:"Start secure upload"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("requires the same issue purpose",async()=>{
    fetchMock.mockResolvedValue(Response.json({allowed:true,revisionId:"rev",issueStatus:"Issued for Approval (IFA)"}));
    prepare();fireEvent.click(screen.getByRole("checkbox"));await screen.findByText(/Keep the original issue status/);
    expect((screen.getByRole("button",{name:"Start secure upload"}) as HTMLButtonElement).disabled).toBe(true);
  });
  it("invalidates eligibility when the revision code changes",async()=>{
    fetchMock.mockResolvedValue(Response.json({allowed:true,revisionId:"rev",issueStatus:"Issued for Review (IFR)"}));
    prepare();fireEvent.click(screen.getByRole("checkbox"));await screen.findByText(/replacement will require fresh security/);
    fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"B"}});
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
    expect(screen.queryByText(/replacement will require fresh security/)).toBeNull();
  });
  it("ignores a late check response after unchecking",async()=>{
    let resolve!:(value:Response)=>void;fetchMock.mockReturnValue(new Promise<Response>(done=>{resolve=done;}));
    prepare();fireEvent.click(screen.getByRole("checkbox"));fireEvent.click(screen.getByRole("checkbox"));
    resolve(Response.json({allowed:false,message:TRANSMITTED_OVERRIDE_WARNING}));
    await waitFor(()=>expect(screen.queryByRole("alert")).toBeNull());
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(false);
  });
});
