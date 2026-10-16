import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {AdminPreviewBoundary} from "./admin-preview-boundary";
import {ProjectMemberRemove} from "./project-member-remove";

const {remove}=vi.hoisted(()=>({remove:vi.fn()}));
vi.mock("@/app/app/workflow-actions",()=>({removeProjectMember:remove}));
vi.mock("next/navigation",()=>({useRouter:()=>({refresh:vi.fn()})}));
const props={organisationId:"org",projectId:"project",member:{userId:"engineer-id",name:"Engineer With A Very Long Name",role:"engineer"}};
beforeEach(()=>{
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event("close"));}});
});
afterEach(()=>{cleanup();document.body.style.overflow="";});
function open(){render(<ProjectMemberRemove {...props}/>);const trigger=screen.getByRole("button",{name:`Remove ${props.member.name} from project`});trigger.focus();fireEvent.click(trigger);return trigger;}

describe("accessible project member removal",()=>{
  it("opens a native named dialog with the existing access and retention warning",()=>{
    const trigger=open();
    const dialog=screen.getByRole("dialog",{name:`Remove ${props.member.name}?`});
    expect(dialog.tagName).toBe("DIALOG");expect(trigger.getAttribute("aria-expanded")).toBe("true");expect(trigger.classList.contains("min-h-11")).toBe(true);
    expect(screen.getByText(/Uploaded files, decisions and audit history will remain intact/)).toBeTruthy();
    expect(screen.getByRole("heading",{name:`Remove ${props.member.name}?`}).classList.contains("[overflow-wrap:anywhere]")).toBe(true);
    expect(screen.queryByText(/final active Project Manager/)).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");expect(remove).not.toHaveBeenCalled();
  });
  it("restores focus and the previous body scrolling style when cancelled",()=>{
    document.body.style.overflow="clip";
    const trigger=open();
    fireEvent.click(screen.getByRole("button",{name:"Keep appointment"}));
    expect(screen.queryByRole("dialog")).toBeNull();expect(trigger.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(trigger);expect(document.body.style.overflow).toBe("clip");expect(remove).not.toHaveBeenCalled();
  });
  it("allows native Escape cancellation and restores focus on the resulting close",()=>{
    const trigger=open();const dialog=screen.getByRole("dialog") as HTMLDialogElement;
    const event=new Event("cancel",{cancelable:true});
    fireEvent(dialog,event);expect(event.defaultPrevented).toBe(false);
    // jsdom does not implement Escape's native close default action.
    act(()=>dialog.close());
    expect(screen.queryByRole("dialog")).toBeNull();expect(document.activeElement).toBe(trigger);expect(remove).not.toHaveBeenCalled();
  });
  it("keeps the final project manager warning visible only for that role",()=>{
    render(<ProjectMemberRemove {...props} member={{...props.member,role:"project_admin"}}/>);
    fireEvent.click(screen.getByRole("button",{name:`Remove ${props.member.name} from project`}));
    expect(screen.getByText("The final active Project Manager cannot be removed until a replacement has accepted an appointment.")).toBeTruthy();
  });
  it("submits the same scoped server action payload after explicit confirmation",async()=>{
    remove.mockResolvedValue({ok:true,message:"Project appointment removed."});open();
    const form=screen.getByRole("form",{name:`Remove project appointment for ${props.member.name}`}) as HTMLFormElement;
    expect(Object.fromEntries(new FormData(form))).toEqual({organisationId:"org",projectId:"project",userId:"engineer-id",memberRole:"engineer"});
    await act(async()=>{fireEvent.submit(form);});
    await waitFor(()=>expect(remove).toHaveBeenCalledOnce());
    expect(Object.fromEntries(remove.mock.calls[0][1] as FormData)).toEqual({organisationId:"org",projectId:"project",userId:"engineer-id",memberRole:"engineer"});
    expect(screen.getByRole("status").textContent).toBe("Project appointment removed.");
  });
  it("keeps returned errors visible with retry and dismissal available",async()=>{
    remove.mockResolvedValue({message:"The final active project manager cannot be removed."});open();
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:`Remove project appointment for ${props.member.name}`}));});
    expect((await screen.findByRole("alert")).textContent).toBe("The final active project manager cannot be removed.");
    expect((screen.getByRole("button",{name:"Remove appointment"}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Close removal confirmation"}));expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("prevents repeated submissions and cancellation while the request is pending",async()=>{
    let finish:(value:{message:string})=>void=()=>{};
    remove.mockReturnValue(new Promise(resolve=>{finish=resolve;}));open();
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:`Remove project appointment for ${props.member.name}`}));});
    const dialog=screen.getByRole("dialog");
    expect(screen.getByRole("form").getAttribute("aria-busy")).toBe("true");
    for(const name of ["Removing…","Keep appointment","Close removal confirmation"])expect((screen.getByRole("button",{name}) as HTMLButtonElement).disabled).toBe(true);
    const event=new Event("cancel",{cancelable:true});fireEvent(dialog,event);expect(event.defaultPrevented).toBe(true);
    await act(async()=>{finish({message:"Please try again."});});await screen.findByRole("alert");
  });
  it("retains the read-only preview lock on both the trigger and confirmation controls",()=>{
    render(<AdminPreviewBoundary preview={{organisationId:"org",projectId:"project",role:"project_admin",displayName:"Manager",disciplines:[],expiresAt:"2099-01-01"}}><ProjectMemberRemove {...props}/></AdminPreviewBoundary>);
    const trigger=screen.getByRole("button",{name:`Remove ${props.member.name} from project`}) as HTMLButtonElement;
    expect(trigger.disabled).toBe(true);trigger.click();expect(screen.queryByRole("dialog")).toBeNull();
    const dialog=document.querySelector("dialog")!;
    for(const button of dialog.querySelectorAll("button"))expect(button.disabled).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });
});
