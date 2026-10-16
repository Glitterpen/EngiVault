import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import {PendingProjectInvitations,type PendingProjectInvitation} from "./pending-project-invitations";

const {refresh}=vi.hoisted(()=>({refresh:vi.fn()}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
const fetchMock=vi.fn();
const invitation:PendingProjectInvitation={invitation_id:"invitation-1",email:"engineer.with.a.very.long.work.email@engineering-example.test",project_role:"engineer",discipline:"Instrumentation and control",created_at:"2026-10-01",last_sent_at:"2026-10-15",expires_at:"2026-10-22",send_count:2,expired:false};
const props={organisationId:"org",projectId:"project",invitations:[invitation]};
beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",fetchMock);});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
function expandInvitations(){
  const summary=screen.getByText("Pending invitations",{selector:"h2"}).closest("summary")!;
  fireEvent.click(summary);
  return summary.closest("details")!;
}

describe("compact pending project invitations",()=>{
  it("starts pending invitations collapsed with the count visible, and keeps expanded identities readable",()=>{
    const {container}=render(<PendingProjectInvitations {...props}/>);
    const disclosure=container.querySelector("details")!;
    expect(disclosure.open).toBe(false);
    expect(screen.getByLabelText("1 awaiting acceptance").textContent).toBe("1");
    expandInvitations();expect(disclosure.open).toBe(true);
    const email=screen.getByRole("heading",{name:invitation.email});
    expect(email.classList.contains("truncate")).toBe(false);
    expect(email.classList.contains("[overflow-wrap:anywhere]")).toBe(true);
    expect(within(screen.getByRole("article",{name:`Invitation for ${invitation.email}`})).getByText("engineer · Instrumentation and control")).toBeTruthy();
    const delivery=screen.getByText("Delivery details").closest("details")!;
    expect(delivery.open).toBe(false);
    expect(within(delivery).getByText("2")).toBeTruthy();
    expect(screen.getByRole("button",{name:`Resend invitation to ${invitation.email}`}).classList.contains("min-h-11")).toBe(true);
    expect(screen.getByRole("button",{name:`Delete invitation for ${invitation.email}`}).classList.contains("min-h-11")).toBe(true);
  });
  it("starts empty invitation history collapsed and still provides the empty message",()=>{
    const {container}=render(<PendingProjectInvitations {...props} invitations={[]}/>);
    expect(container.querySelector("details")?.open).toBe(false);
    expect(screen.getByText("No pending invitations")).toBeTruthy();
  });
  it("labels expired links explicitly without losing the resend action",()=>{
    render(<PendingProjectInvitations {...props} invitations={[{...invitation,expired:true}]}/>);
    expandInvitations();
    expect(screen.getByText("Link expired")).toBeTruthy();
    expect(screen.getByRole("button",{name:`Resend invitation to ${invitation.email}`})).toBeTruthy();
  });
  it("retains the scoped resend POST and announces delivery feedback",async()=>{
    fetchMock.mockResolvedValue({ok:true,json:async()=>({message:"Invitation resent.",delivery:{emailSent:true}})});
    render(<PendingProjectInvitations {...props}/>);
    expandInvitations();
    fireEvent.click(screen.getByRole("button",{name:`Resend invitation to ${invitation.email}`}));
    await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/v1/organisations/org/projects/project/invitations/invitation-1/resend",{method:"POST"});
    expect(screen.getByRole("status").textContent).toBe("Invitation resent.");
    expect(screen.queryByLabelText(`Fresh invitation link for ${invitation.email}`)).toBeNull();
  });
  it("reopens returned feedback when the invitation panel was closed while resending",async()=>{
    let finish:(value:{ok:boolean;json:()=>Promise<{message:string;delivery:{emailSent:boolean}}>})=>void=()=>{};
    fetchMock.mockReturnValue(new Promise(resolve=>{finish=resolve;}));
    render(<PendingProjectInvitations {...props}/>);
    const disclosure=expandInvitations();
    fireEvent.click(screen.getByRole("button",{name:`Resend invitation to ${invitation.email}`}));
    fireEvent.click(disclosure.querySelector("summary")!);
    expect(disclosure.open).toBe(false);
    await act(async()=>{finish({ok:true,json:async()=>({message:"Invitation resent.",delivery:{emailSent:true}})});});
    expect((await screen.findByRole("status")).textContent).toBe("Invitation resent.");
    expect(disclosure.open).toBe(true);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/v1/organisations/org/projects/project/invitations/invitation-1/resend",{method:"POST"});
  });
  it("keeps a fresh acceptance link available when email delivery was unavailable",async()=>{
    const writeText=vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator,"clipboard",{configurable:true,value:{writeText}});
    fetchMock.mockResolvedValue({ok:true,json:async()=>({message:"Use this fresh invitation link.",delivery:{emailSent:false,acceptUrl:"https://example.test/invitation/synthetic"}})});
    render(<PendingProjectInvitations {...props}/>);
    expandInvitations();
    fireEvent.click(screen.getByRole("button",{name:`Resend invitation to ${invitation.email}`}));
    const link=await screen.findByLabelText(`Fresh invitation link for ${invitation.email}`) as HTMLInputElement;
    expect(link.readOnly).toBe(true);expect(link.value).toBe("https://example.test/invitation/synthetic");
    fireEvent.click(screen.getByRole("button",{name:`Copy invitation link for ${invitation.email}`}));
    await waitFor(()=>expect(writeText).toHaveBeenCalledExactlyOnceWith("https://example.test/invitation/synthetic"));
  });
  it("requires explicit deletion confirmation and preserves cancellation",()=>{
    render(<PendingProjectInvitations {...props}/>);
    expandInvitations();
    const button=screen.getByRole("button",{name:`Delete invitation for ${invitation.email}`});
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("group",{name:`Confirm deletion of invitation for ${invitation.email}`})).toBeTruthy();
    expect(screen.getByText(/current acceptance link will stop working immediately/)).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Keep invitation"}));
    expect(screen.queryByRole("group",{name:`Confirm deletion of invitation for ${invitation.email}`})).toBeNull();expect(fetchMock).not.toHaveBeenCalled();
  });
  it("retains the exact DELETE endpoint and removes only the successful invitation",async()=>{
    fetchMock.mockResolvedValue({ok:true,json:async()=>({})});
    render(<PendingProjectInvitations {...props} invitations={[invitation,{...invitation,invitation_id:"invitation-2",email:"second@example.test"}]}/>);
    expandInvitations();
    fireEvent.click(screen.getByRole("button",{name:`Delete invitation for ${invitation.email}`}));
    fireEvent.click(screen.getByRole("button",{name:`Confirm delete invitation for ${invitation.email}`}));
    await waitFor(()=>expect(refresh).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith("/api/v1/organisations/org/projects/project/invitations/invitation-1",{method:"DELETE"});
    expect(screen.queryByRole("article",{name:`Invitation for ${invitation.email}`})).toBeNull();
    expect(screen.getByRole("article",{name:"Invitation for second@example.test"})).toBeTruthy();
    expect(screen.getByLabelText("1 awaiting acceptance")).toBeTruthy();
  });
  it("keeps failed deletion feedback and confirmation visible for retry",async()=>{
    fetchMock.mockResolvedValue({ok:false,json:async()=>({error:{message:"Invitation could not be deleted."}})});
    render(<PendingProjectInvitations {...props}/>);
    expandInvitations();
    fireEvent.click(screen.getByRole("button",{name:`Delete invitation for ${invitation.email}`}));
    fireEvent.click(screen.getByRole("button",{name:`Confirm delete invitation for ${invitation.email}`}));
    expect((await screen.findByRole("alert")).textContent).toBe("Invitation could not be deleted.");
    expect((screen.getByRole("button",{name:`Confirm delete invitation for ${invitation.email}`}) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("article",{name:`Invitation for ${invitation.email}`})).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("announces safe resend failures and does not refresh after a failed request",async()=>{
    fetchMock.mockRejectedValue(new Error("Supabase unavailable"));
    render(<PendingProjectInvitations {...props}/>);
    expandInvitations();
    fireEvent.click(screen.getByRole("button",{name:`Resend invitation to ${invitation.email}`}));
    expect((await screen.findByRole("alert")).textContent).toBe("Invitation could not be resent.");
    expect(refresh).not.toHaveBeenCalled();
  });
  it("keeps invitation writes disabled in the audited read-only preview",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"project_admin",displayName:"Manager",disciplines:[],expiresAt:"2099-01-01"}}><PendingProjectInvitations {...props}/></AdminPreviewBoundary>);
    expandInvitations();
    const resend=screen.getByRole("button",{name:`Resend invitation to ${invitation.email}`}) as HTMLButtonElement;
    const remove=screen.getByRole("button",{name:`Delete invitation for ${invitation.email}`}) as HTMLButtonElement;
    expect(resend.disabled).toBe(true);expect(remove.disabled).toBe(true);
    resend.click();remove.click();expect(fetchMock).not.toHaveBeenCalled();expect(screen.queryByRole("group",{name:`Confirm deletion of invitation for ${invitation.email}`})).toBeNull();
  });
});
