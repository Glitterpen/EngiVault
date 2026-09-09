import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {RevisionUpload} from "./revision-upload";
import {TRANSMITTED_OVERRIDE_WARNING,TRANSMITTAL_DAILY_NOTICE} from "@/lib/submission-override";
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
vi.mock("@/lib/supabase/browser",()=>({createClient:vi.fn()}));
const fetchMock=vi.fn();
const props={organisationId:"org",projectId:"project",documentId:"doc",deliveryStage:"feed" as const,completedIssueStatuses:[]};
function prepare(){render(<RevisionUpload {...props}/>);fireEvent.change(screen.getByRole("textbox",{name:"Revision"}),{target:{value:"A"}});fireEvent.change(screen.getByRole("combobox"),{target:{value:"Issued for Review (IFR)"}});}
beforeEach(()=>{vi.stubGlobal("fetch",fetchMock);fetchMock.mockReset();});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
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
