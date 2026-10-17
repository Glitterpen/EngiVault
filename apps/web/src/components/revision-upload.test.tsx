import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {RevisionUpload} from "./revision-upload";
import {createClient} from "@/lib/supabase/browser";
import {TRANSMITTED_OVERRIDE_WARNING,TRANSMITTAL_DAILY_NOTICE} from "@/lib/submission-override";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/supabase/browser",()=>({createClient:vi.fn()}));
const fetchMock=vi.fn();
const props={organisationId:"org",projectId:"project",documentId:"doc",deliveryStage:"feed" as const,completedIssueStatuses:[]};
const acceptedRevision=(issue_status:string,created_at="2026-09-01T12:00:00Z")=>({issue_status,created_at,reviewed_at:null,state:"ready",control_status:"accepted",overridden_by_revision_id:null});
const acceptedStages=[acceptedRevision("Issued for Review (IFR)"),acceptedRevision("Issued for Approval (IFA)")];
function prepare(){render(<RevisionUpload {...props}/>);fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"A"}});fireEvent.change(screen.getByRole("combobox"),{target:{value:"Issued for Review (IFR)"}});}
beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();vi.mocked(createClient).mockClear();});
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
    render(<RevisionUpload {...props} completedIssueStatuses={["Issued for Review (IFR)","Issued for Approval (IFA)"]} completedIssueRevisions={acceptedStages}/>);
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

describe("revision upload presentation and accessibility",()=>{
  it("does not unlock IFD or IFC from a legacy IFA-only history",()=>{
    render(<RevisionUpload {...props} completedIssueStatuses={["Issued for Approval (IFA)"]}/>);
    for(const purpose of ["Issued for Approval (IFA)","Issued for Design (IFD)","Issued for Construction (IFC)"]){
      expect((screen.getByRole("option",{name:purpose}) as HTMLOptionElement).disabled).toBe(true);
    }
    expect(screen.getByText("Await DCC acceptance of IFR first.")).toBeTruthy();
  });

  it.each(["Issued for Approval (IFA)","Issued for Design (IFD)","Issued for Construction (IFC)"])("blocks a manipulated disabled %s selection before checksum, network or storage work",purpose=>{
    render(<RevisionUpload {...props} completedIssueStatuses={["Issued for Approval (IFA)"]}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"D01"}});
    const select=screen.getByRole("combobox") as HTMLSelectElement;
    (screen.getByRole("option",{name:purpose}) as HTMLOptionElement).disabled=false;
    fireEvent.change(select,{target:{value:purpose}});
    const file=new File(["%PDF-1.7"],"design.pdf",{type:"application/pdf"});
    fireEvent.change(screen.getByLabelText("Controlled issue file"),{target:{files:{item:()=>file}}});
    fireEvent.click(screen.getByRole("button",{name:"Start secure upload"}));
    expect(screen.getByRole("alert").textContent).toContain("DCC must accept Issued for Review (IFR)");
    expect(document.activeElement).toBe(select);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("normalises completed controlled labels consistently in options and guidance",()=>{
    render(<RevisionUpload {...props} completedIssueStatuses={[" issued FOR review (ifr) "," ISSUED FOR APPROVAL (ifa) "]} completedIssueRevisions={[acceptedRevision(" issued FOR review (ifr) "),acceptedRevision(" ISSUED FOR APPROVAL (ifa) ")]}/>);
    expect((screen.getByRole("option",{name:"Issued for Design (IFD)"}) as HTMLOptionElement).disabled).toBe(false);
    expect(screen.queryByText("Await DCC acceptance of IFR first.")).toBeNull();
    expect(screen.queryByText("IFR accepted. Await DCC acceptance of IFA.")).toBeNull();
  });

  it("blocks a terminal issue when the legacy IFA was submitted before the only completed IFR",()=>{
    render(<RevisionUpload {...props} completedIssueStatuses={["Issued for Review (IFR)","Issued for Approval (IFA)"]} completedIssueRevisions={[
      acceptedRevision("Issued for Approval (IFA)","2026-09-01T12:00:00Z"),
      acceptedRevision("Issued for Review (IFR)","2026-09-02T12:00:00Z"),
    ]}/>);
    const option=screen.getByRole("option",{name:"Issued for Design (IFD)"}) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    option.disabled=false;
    fireEvent.change(screen.getByRole("combobox"),{target:{value:option.value}});
    fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"D01"}});
    const file=new File(["%PDF-1.7"],"design.pdf",{type:"application/pdf"});
    fireEvent.change(screen.getByLabelText("Controlled issue file"),{target:{files:{item:()=>file}}});
    fireEvent.click(screen.getByRole("button",{name:"Start secure upload"}));
    expect(screen.getByRole("alert").textContent).toContain("IFR before IFA");
    expect(fetchMock).not.toHaveBeenCalled();expect(createClient).not.toHaveBeenCalled();
  });

  it.each(["Issued for Review (IFR)","Issued for Approval (IFA)"])("does not unlock the next stage while %s is waiting for DCC acceptance",purpose=>{
    const waiting={...acceptedRevision(purpose),control_status:"submitted"};
    const records=purpose==="Issued for Approval (IFA)"?[acceptedStages[0],waiting]:[waiting];
    const nextPurpose=purpose==="Issued for Approval (IFA)"?"Issued for Design (IFD)":"Issued for Approval (IFA)";
    render(<RevisionUpload {...props} completedIssueStatuses={records.map(row=>row.issue_status)} completedIssueRevisions={records}/>);
    const option=screen.getByRole("option",{name:nextPurpose}) as HTMLOptionElement;
    expect(option.disabled).toBe(true);
    option.disabled=false;
    fireEvent.change(screen.getByRole("combobox"),{target:{value:nextPurpose}});
    fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"A01"}});
    const file=new File(["%PDF-1.7"],"review.pdf",{type:"application/pdf"});
    fireEvent.change(screen.getByLabelText("Controlled issue file"),{target:{files:{item:()=>file}}});
    fireEvent.click(screen.getByRole("button",{name:"Start secure upload"}));
    expect(screen.getByRole("alert").textContent).toContain("DCC must accept IFR");
    expect(fetchMock).not.toHaveBeenCalled();expect(createClient).not.toHaveBeenCalled();
  });

  it("names the form and groups revision details separately from files",()=>{
    render(<RevisionUpload {...props}/>);
    expect(screen.getByRole("form",{name:"Upload revision"}).getAttribute("aria-busy")).toBe("false");
    expect(screen.getByRole("group",{name:"Revision details"}).contains(screen.getByRole("textbox",{name:"Revision"}))).toBe(true);
    expect(screen.getByRole("group",{name:"Revision files"}).contains(screen.getByLabelText("Controlled issue file"))).toBe(true);
    expect((screen.getByLabelText("Issue date") as HTMLInputElement).required).toBe(false);
    expect(screen.getByText("Await DCC acceptance of IFR first.")).toBeTruthy();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(screen.getByRole("button",{name:"Revision workflow guidance"}));
    expect(screen.getByRole("tooltip").textContent).toContain("100% at Issued for Design (IFD)");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the complete selected filename and links file format guidance",()=>{
    render(<RevisionUpload {...props}/>);
    const file=new File(["%PDF-1.7"],"EDE-ENGINEERING-VERY-LONG-DOCUMENT-NAME-WITHOUT-SPACES-IFR-R01.pdf",{type:"application/pdf"});
    const input=screen.getByLabelText("Controlled issue file") as HTMLInputElement;
    fireEvent.change(input,{target:{files:{item:()=>file}}});
    const descriptions=(input.getAttribute("aria-describedby")??"").split(" ").map(id=>document.getElementById(id)?.textContent);
    expect(descriptions[0]).toContain("maximum 250 MB");
    expect(descriptions[1]).toContain(file.name);
    expect(screen.getByText(file.name).parentElement?.className).toContain("overflow-wrap:anywhere");
    expect(input.accept).toBe(".pdf,.docx,.xlsx,.dwg");
    expect(input.required).toBe(true);
    expect(screen.getByRole("button",{name:"Start secure upload"}).className).toContain("w-full");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps native-source requirements visible and prevents an incomplete final issue",()=>{
    render(<RevisionUpload {...props} completedIssueStatuses={["Issued for Review (IFR)","Issued for Approval (IFA)"]} completedIssueRevisions={acceptedStages}/>);
    fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"IFD"}});
    fireEvent.change(screen.getByRole("combobox"),{target:{value:"Issued for Design (IFD)"}});
    const file=new File(["%PDF-1.7"],"design.pdf",{type:"application/pdf"});
    fireEvent.change(screen.getByLabelText("Controlled issue file"),{target:{files:{item:()=>file}}});
    const native=screen.getByLabelText("Native source file") as HTMLInputElement;
    expect(native.required).toBe(true);
    expect(native.accept).toBe(".dwg,.docx,.xlsx");
    expect(screen.getByText("Required")).toBeTruthy();
    expect(screen.getByRole("button",{name:"Native source requirement"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"Start secure upload"}));
    expect(screen.getByRole("alert").textContent).toContain("Attach the editable DWG, DOCX or XLSX source required");
    expect(document.activeElement).toBe(native);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("exposes honest upload stages without fabricated percentages and preserves secure completion",async()=>{
    const upload=vi.fn().mockResolvedValue({error:null});
    vi.mocked(createClient).mockReturnValue({storage:{from:()=>({uploadToSignedUrl:upload})}} as unknown as ReturnType<typeof createClient>);
    vi.spyOn(Blob.prototype,"arrayBuffer").mockImplementation(function(this:Blob){return readBytes(this);});
    vi.stubGlobal("crypto",{subtle:{digest:vi.fn().mockResolvedValue(new Uint8Array(32).buffer)}});
    let resolve!:(value:Response)=>void;
    fetchMock.mockReturnValueOnce(new Promise<Response>(done=>{resolve=done;})).mockResolvedValueOnce(Response.json({}));
    try{
      prepare();
      fireEvent.change(screen.getByLabelText("Issue date"),{target:{value:"2026-10-16"}});
      const file=new File(["%PDF-1.7"],"review.pdf",{type:"application/pdf"});
      fireEvent.change(screen.getByLabelText("Controlled issue file"),{target:{files:{item:()=>file}}});
      fireEvent.click(screen.getByRole("button",{name:"Start secure upload"}));
      await waitFor(()=>expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(screen.getByRole("form",{name:"Upload revision"}).getAttribute("aria-busy")).toBe("true");
      const stages=screen.getByRole("region",{name:"Secure upload stages"});
      expect(stages.querySelector('[aria-current="step"]')?.textContent).toContain("Prepare upload");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.getByText("Preparing secure upload links...")).toBeTruthy();
      expect(stages.textContent).not.toContain("25%");
      expect((screen.getByRole("textbox",{name:"Revision"}) as HTMLInputElement).disabled).toBe(true);
      expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({revisionCode:"A",issueStatus:"Issued for Review (IFR)",issueDate:"2026-10-16",fileName:"review.pdf"});
      resolve(Response.json({revisionId:"rev",path:"primary",token:"token"}));
      await screen.findByText("Upload complete. The revision is queued for secure processing.");
      expect(stages.querySelector('[aria-current="step"]')?.textContent).toContain("Queued for security checks");
      expect(screen.queryByRole("progressbar")).toBeNull();
      expect(screen.getByRole("form",{name:"Upload revision"}).getAttribute("aria-busy")).toBe("false");
      expect(fetchMock.mock.calls[1][0]).toContain("/revisions/rev/complete");
      expect(upload).toHaveBeenCalledWith("primary","token",expect.any(File),{contentType:"application/pdf",upsert:false});
    }finally{
      vi.restoreAllMocks();
    }
  });
});
