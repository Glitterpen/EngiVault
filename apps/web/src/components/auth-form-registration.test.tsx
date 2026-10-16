import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {AuthState} from "@/app/(auth)/actions";
import {AuthForm} from "./auth-form";

const captcha=vi.hoisted(()=>({resetKeys:[] as number[]}));
vi.mock("./auth-turnstile",async()=>{
  const {useEffect}=await import("react");
  return {AuthTurnstile:({siteKey,resetKey,onTokenChange}:{siteKey?:string;resetKey:number;onTokenChange:(value:string)=>void})=>{
    useEffect(()=>{captcha.resetKeys.push(resetKey);if(resetKey>0)onTokenChange("");},[onTokenChange,resetKey]);
    return siteKey?.trim()?<div><button type="button" onClick={()=>onTokenChange("synthetic-registration-token")}>Complete security check</button><button type="button" onClick={()=>onTokenChange("")}>Expire security check</button></div>:null;
  }};
});

function actions(){return {
  action:vi.fn<(previous:AuthState,data:FormData)=>Promise<AuthState>>().mockResolvedValue(undefined),
  resendAction:vi.fn<(previous:AuthState,data:FormData)=>Promise<AuthState>>().mockResolvedValue(undefined),
  resetAction:vi.fn<(previous:AuthState,data:FormData)=>Promise<AuthState>>().mockResolvedValue(undefined),
};}
const invitation=`/invite/${"a".repeat(64)}`;
const ownerValues={organisationName:"Synthetic Engineering",organisationSlug:"synthetic-engineering",name:"Synthetic Owner",email:"synthetic@example.test",password:"synthetic-password-not-a-secret"};
function form(){return screen.getByLabelText("Work email").closest("form")!;}
function fillOwner(){
  for(const [label,value] of [["Organisation name",ownerValues.organisationName],["Organisation URL name",ownerValues.organisationSlug],["Full name",ownerValues.name],["Work email",ownerValues.email],["Password",ownerValues.password]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
}
function openHelp(){const summary=screen.getByText("Need help registering?",{selector:"summary"});if(!summary.closest("details")?.open)fireEvent.click(summary);return summary.closest("details")!;}
function submitters(){return Array.from(form().querySelectorAll<HTMLButtonElement>('button[type="submit"],button:not([type])'));}
async function submit(button?:HTMLButtonElement){await act(async()=>{if(button)fireEvent(form(),new SubmitEvent("submit",{bubbles:true,cancelable:true,submitter:button}));else fireEvent.submit(form());});}
beforeEach(()=>{vi.clearAllMocks();captcha.resetKeys.length=0;});
afterEach(cleanup);

describe("organisation and invited registration redesign",()=>{
  it("presents owner registration as one named heading/form with separate organisation and owner fieldsets",()=>{
    const handlers=actions();render(<AuthForm mode="register" {...handlers}/>);
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);expect(screen.getByRole("heading",{level:1,name:"Register your organisation"})).toBeTruthy();
    expect(screen.getByText("Set up your workspace and owner account.")).toBeTruthy();expect(screen.getByRole("form",{name:"Register your organisation"})).toBe(form());
    const organisation=screen.getByRole("group",{name:"Organisation"}),owner=screen.getByRole("group",{name:"Owner account"});
    for(const label of ["Organisation name","Organisation URL name"])expect(within(organisation).getByLabelText(label)).toBeTruthy();
    for(const label of ["Full name","Work email","Password"])expect(within(owner).getByLabelText(label)).toBeTruthy();
    expect(within(organisation).queryByLabelText("Password")).toBeNull();expect(within(owner).queryByLabelText("Organisation name")).toBeNull();
    expect(form().querySelectorAll("form")).toHaveLength(0);expect(handlers.action).not.toHaveBeenCalled();
  });
  it("keeps owner fields required and labelled with compatible autofill and hidden-by-default password",()=>{
    render(<AuthForm mode="register" {...actions()}/>);
    for(const [label,name,autocomplete] of [["Organisation name","organisationName","organization"],["Organisation URL name","organisationSlug",""],["Full name","name","name"],["Work email","email","email"],["Password","password","new-password"]] as const){
      const input=screen.getByLabelText(label) as HTMLInputElement;
      expect(input.name).toBe(name);expect(input.required).toBe(true);expect(input.autocomplete).toBe(autocomplete);expect(input.id).not.toBe("");expect(document.querySelector(`label[for="${input.id}"]`)).toBeTruthy();
    }
    expect((screen.getByLabelText("Work email") as HTMLInputElement).type).toBe("email");expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
    expect(screen.getByRole("button",{name:"Register organisation"}).classList.contains("min-h-11")).toBe(true);
  });
  it("preserves every owner field, the supplied next and CAPTCHA token in the signup payload",async()=>{
    const handlers=actions();handlers.action.mockResolvedValue({message:"Synthetic registration response."});
    render(<AuthForm mode="register" {...handlers} next="/organisation/setup" captchaSiteKey="synthetic-public-site-key"/>);fillOwner();fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));
    const expected={next:"/organisation/setup",...ownerValues,captchaToken:"synthetic-registration-token"};expect(Object.fromEntries(new FormData(form()))).toEqual(expected);
    await submit();expect(handlers.action).toHaveBeenCalledTimes(1);expect(handlers.action.mock.calls[0][0]).toBeUndefined();expect(Object.fromEntries(handlers.action.mock.calls[0][1])).toEqual(expected);
    expect(handlers.resendAction).not.toHaveBeenCalled();expect(handlers.resetAction).not.toHaveBeenCalled();
  });
  it("keeps invited registration distinct with only three account fields and the exact invitation next",async()=>{
    const handlers=actions();handlers.action.mockResolvedValue({message:"Synthetic invited registration response."});
    render(<AuthForm mode="register" {...handlers} next={invitation}/>);
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);expect(screen.getByRole("heading",{level:1,name:"Create your invited account"})).toBeTruthy();expect(screen.getByText("Use the work email on your invitation.")).toBeTruthy();
    expect(screen.queryByRole("group",{name:"Organisation"})).toBeNull();expect(screen.queryByLabelText("Organisation name")).toBeNull();expect(screen.queryByLabelText("Organisation URL name")).toBeNull();
    for(const [label,value] of [["Full name","Synthetic Engineer"],["Work email","invited@example.test"],["Password","synthetic-invited-password"]])fireEvent.change(screen.getByLabelText(label),{target:{value}});
    await submit();expect(Object.fromEntries(handlers.action.mock.calls[0][1])).toEqual({next:invitation,name:"Synthetic Engineer",email:"invited@example.test",password:"synthetic-invited-password",captchaToken:""});
    expect(screen.getByRole("link",{name:"Sign in"}).getAttribute("href")).toBe(`/login?next=${encodeURIComponent(invitation)}`);
  });
  it.each(["/invite/not-a-token",`/invite/${"a".repeat(63)}`,`/invite/${"g".repeat(64)}`,`${invitation}?extra=value`,`${invitation}/extra`])("does not hide mandatory organisation fields for malformed invitation destination %s",next=>{
    render(<AuthForm mode="register" {...actions()} next={next}/>);
    expect(screen.getByRole("heading",{name:"Register your organisation"})).toBeTruthy();
    for(const label of ["Organisation name","Organisation URL name"]){
      expect((screen.getByLabelText(label) as HTMLInputElement).required).toBe(true);
    }
    expect(screen.queryByRole("button",{name:"Create invited account"})).toBeNull();
    expect(screen.getByRole("alert").textContent).toContain("This invitation link is invalid or incomplete.");
    expect(screen.getByRole("alert").textContent).toContain("not an invited team account");
    expect(new FormData(form()).get("next")).toBe("/app");
    expect(screen.getByRole("link",{name:"Sign in"}).getAttribute("href")).toBe("/login?next=%2Fapp");
  });
  it.each([`/invite/${"A".repeat(64)}`,`/INVITE/${"a".repeat(64)}`])("uses the same trimmed, case-insensitive valid invitation destination %s as the server",destination=>{
    render(<AuthForm mode="register" {...actions()} next={`  ${destination}  `}/>);
    expect(screen.getByRole("heading",{name:"Create your invited account"})).toBeTruthy();
    expect(screen.queryByLabelText("Organisation name")).toBeNull();
    expect(new FormData(form()).get("next")).toBe(destination);
    expect(screen.getByRole("link",{name:"Sign in"}).getAttribute("href")).toBe(`/login?next=${encodeURIComponent(destination)}`);
  });
  it.each(["https://attacker.example/invite/invalid","//attacker.example/invite/invalid","/app\\redirect"])("keeps unsafe next %s out of registration fields and navigation",next=>{
    render(<AuthForm mode="register" {...actions()} next={next}/>);
    expect(screen.getByRole("heading",{name:"Register your organisation"})).toBeTruthy();
    expect((screen.getByLabelText("Organisation name") as HTMLInputElement).required).toBe(true);
    expect(new FormData(form()).get("next")).toBe("/app");
    expect(screen.getByRole("link",{name:"Sign in"}).getAttribute("href")).toBe("/login?next=%2Fapp");
  });
  it("keeps server-side errors visible and associated with their exact owner or account field",async()=>{
    const handlers=actions();handlers.action.mockResolvedValue({errors:{organisationName:["Check organisation name."],organisationSlug:["Check organisation URL name."],name:["Check full name."],email:["Check work email."],password:["Check password."]}});
    render(<AuthForm mode="register" {...handlers}/>);await submit();
    for(const [label,message] of [["Organisation name","Check organisation name."],["Organisation URL name","Check organisation URL name."],["Full name","Check full name."],["Work email","Check work email."],["Password","Check password."]]){
      const input=screen.getByLabelText(label);expect(input.getAttribute("aria-invalid")).toBe("true");
      const error=document.getElementById(input.getAttribute("aria-describedby")!);expect(error?.textContent).toBe(message);expect(error?.getAttribute("role")).toBe("alert");expect(error?.closest("details")).toBeNull();
    }
    expect(screen.getAllByRole("alert")).toHaveLength(5);
  });
  it.each([undefined,invitation])("does not submit or navigate when the password visibility eye is used (next=%s)",next=>{
    const handlers=actions();render(<AuthForm mode="register" {...handlers} next={next}/>);
    const input=screen.getByLabelText("Password") as HTMLInputElement;fireEvent.change(input,{target:{value:"synthetic-password-value"}});const location=window.location.href;
    const eye=screen.getByRole("button",{name:"Show password"}) as HTMLButtonElement;expect(eye.type).toBe("button");expect(eye.getAttribute("aria-controls")).toBe(input.id);
    fireEvent.click(eye);expect(input.type).toBe("text");fireEvent.click(screen.getByRole("button",{name:"Hide password"}));expect(input.type).toBe("password");expect(input.value).toBe("synthetic-password-value");expect(window.location.href).toBe(location);
    for(const handler of Object.values(handlers))expect(handler).not.toHaveBeenCalled();
  });
  it.each([undefined,invitation])("requires a fresh security check for every signup/recovery submitter (next=%s)",next=>{
    render(<AuthForm mode="register" {...actions()} next={next} captchaSiteKey="synthetic-public-site-key"/>);openHelp();
    expect(submitters()).toHaveLength(3);expect(submitters().every(button=>button.disabled)).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));expect(submitters().every(button=>!button.disabled)).toBe(true);expect(new FormData(form()).get("captchaToken")).toBe("synthetic-registration-token");
    fireEvent.click(screen.getByRole("button",{name:"Expire security check"}));expect(submitters().every(button=>button.disabled)).toBe(true);expect(new FormData(form()).get("captchaToken")).toBe("");
  });
  it.each(["action","resetAction","resendAction"] as const)("announces %s pending state, blocks duplicate actions and resets its consumed CAPTCHA",async key=>{
    const handlers=actions();let finish!:(value:AuthState)=>void;handlers[key].mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
    render(<AuthForm mode="register" {...handlers} captchaSiteKey="synthetic-public-site-key"/>);fillOwner();openHelp();fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));
    const button=screen.getByRole("button",{name:key==="action"?"Register organisation":key==="resetAction"?"Forgot password?":"Account not verified? Resend verification"}) as HTMLButtonElement;
    await submit(button);expect(form().getAttribute("aria-busy")).toBe("true");expect(submitters().every(item=>item.disabled)).toBe(true);
    expect(screen.getByRole("button",{name:key==="action"?"Please wait…":key==="resetAction"?"Requesting password reset...":"Requesting verification..."})).toBeTruthy();
    await act(async()=>{finish({message:"Synthetic action completed."});});expect(form().getAttribute("aria-busy")).toBe("false");expect(captcha.resetKeys).toContain(1);expect(submitters().every(item=>item.disabled)).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));expect(submitters().every(item=>!item.disabled)).toBe(true);
  });
  it.each(["resetAction","resendAction"] as const)("keeps %s independent of blank required organisation/name/password fields",async key=>{
    const handlers=actions();handlers[key].mockResolvedValue({message:"Synthetic recovery response."});
    render(<AuthForm mode="register" {...handlers} next="/organisation/setup" captchaSiteKey="synthetic-public-site-key"/>);openHelp();
    fireEvent.change(screen.getByLabelText("Work email"),{target:{value:"owner@example.test"}});fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));
    const button=screen.getByRole("button",{name:key==="resetAction"?"Forgot password?":"Account not verified? Resend verification"}) as HTMLButtonElement;
    expect(button.formNoValidate).toBe(true);expect(button.type).toBe("submit");expect((screen.getByLabelText("Organisation name") as HTMLInputElement).required).toBe(true);expect((screen.getByLabelText("Password") as HTMLInputElement).value).toBe("");
    await submit(button);expect(handlers[key]).toHaveBeenCalledTimes(1);expect(handlers.action).not.toHaveBeenCalled();
    const data=handlers[key].mock.calls[0][1];expect(data.get("email")).toBe("owner@example.test");expect(data.get("next")).toBe("/organisation/setup");expect(data.get("captchaToken")).toBe("synthetic-registration-token");for(const name of ["name","organisationName","organisationSlug","password"])expect(data.get(name)).toBe("");
  });
  it("keeps registration first for implicit Enter and groups recovery and verification inside optional registration help",()=>{
    render(<AuthForm mode="register" {...actions()}/>);
    const primary=screen.getByRole("button",{name:"Register organisation"}) as HTMLButtonElement;expect(submitters()[0]).toBe(primary);expect(primary.formNoValidate).toBe(false);
    const disclosure=screen.getByText("Need help registering?",{selector:"summary"}).closest("details")!;expect(disclosure.open).toBe(false);
    const recovery=screen.getByRole("button",{name:"Forgot password?",hidden:true}) as HTMLButtonElement;
    const verification=screen.getByRole("button",{name:"Account not verified? Resend verification",hidden:true}) as HTMLButtonElement;
    expect(recovery.closest("details")).toBe(disclosure);expect(verification.closest("details")).toBe(disclosure);
    expect(recovery.formNoValidate).toBe(true);expect(verification.formNoValidate).toBe(true);
    expect(disclosure.querySelectorAll('button[type="submit"]')).toHaveLength(2);
  });
  it.each([undefined,invitation])("retains existing-account sign-in guidance and exact destination (next=%s)",async next=>{
    const handlers=actions();handlers.action.mockResolvedValue({showLogin:true,showResend:true,message:"An account may already exist for this work email."});
    render(<AuthForm mode="register" {...handlers} next={next}/>);await submit();
    expect(screen.getByRole("alert").textContent).toContain("Already have an account? Do not wait for another email.");expect(screen.getByRole("link",{name:"Sign in instead"}).getAttribute("href")).toBe(next?`/login?next=${encodeURIComponent(next)}`:"/login");
    expect(screen.getByText("Need help registering?",{selector:"summary"}).closest("details")?.open).toBe(true);
  });
});
