import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {AuthState} from "@/app/(auth)/actions";
import {AuthForm} from "./auth-form";

type ActionKind="primary"|"resend"|"reset";
const harness=vi.hoisted(()=>({
  primary:vi.fn<(previous:AuthState,data:FormData)=>Promise<AuthState>>().mockResolvedValue(undefined),
  resend:vi.fn<(previous:AuthState,data:FormData)=>Promise<AuthState>>().mockResolvedValue(undefined),
  reset:vi.fn<(previous:AuthState,data:FormData)=>Promise<AuthState>>().mockResolvedValue(undefined),
  dispatch:{primary:vi.fn<(data:FormData)=>Promise<void>>().mockResolvedValue(undefined),resend:vi.fn<(data:FormData)=>Promise<void>>().mockResolvedValue(undefined),reset:vi.fn<(data:FormData)=>Promise<void>>().mockResolvedValue(undefined)},
  pending:{primary:false,resend:false,reset:false},
  feedback:{primary:undefined,resend:undefined,reset:undefined} as Record<ActionKind,AuthState>,
  hooks:[] as {action:unknown;initial:unknown}[],
  captchaResets:[] as number[],
}));

vi.mock("react",async importOriginal=>({
  ...await importOriginal<typeof import("react")>(),
  useActionState:(action:unknown,initial:unknown)=>{
    harness.hooks.push({action,initial});
    const key=action===harness.primary?"primary":action===harness.resend?"resend":action===harness.reset?"reset":null;
    if(!key)throw new Error("Unexpected authentication action hook");
    return [harness.feedback[key],harness.dispatch[key],harness.pending[key]];
  },
}));
vi.mock("./auth-turnstile",async()=>{
  const {useEffect}=await import("react");
  return {AuthTurnstile:({siteKey,resetKey,onTokenChange}:{siteKey?:string;resetKey:number;onTokenChange:(value:string)=>void})=>{
    useEffect(()=>{harness.captchaResets.push(resetKey);if(resetKey>0)onTokenChange("");},[onTokenChange,resetKey]);
    return siteKey?.trim()?<div><button type="button" onClick={()=>onTokenChange("synthetic-widget-token")}>Complete security check</button><button type="button" onClick={()=>onTokenChange("")}>Expire security check</button></div>:null;
  }};
});

const props={mode:"login" as const,action:harness.primary,resendAction:harness.resend,resetAction:harness.reset};
function expandHelp(){
  const summary=screen.queryByText("Need help signing in?");
  if(summary&&!summary.closest("details")?.open)fireEvent.click(summary);
}
function submitButtons(){
  expandHelp();
  return [screen.getByRole("button",{name:"Sign in"}),screen.getByRole("button",{name:"Forgot password?"}),screen.getByRole("button",{name:"Account not verified? Resend verification"})] as HTMLButtonElement[];
}
beforeEach(()=>{
  vi.clearAllMocks();
  for(const key of ["primary","resend","reset"] as const){harness.pending[key]=false;harness.feedback[key]=undefined;}
  harness.hooks.length=0;harness.captchaResets.length=0;
});
afterEach(cleanup);

describe("authentication form security and workflow regression",()=>{
  it("preserves the primary, verification and recovery action-hook ordering and initial state",()=>{
    render(<AuthForm {...props}/>);
    expect(harness.hooks.slice(0,3)).toEqual([{action:harness.primary,initial:undefined},{action:harness.resend,initial:undefined},{action:harness.reset,initial:undefined}]);
    expect(harness.primary).not.toHaveBeenCalled();expect(harness.resend).not.toHaveBeenCalled();expect(harness.reset).not.toHaveBeenCalled();
  });
  it.each(["login","register"] as const)("keeps %s password hidden, autofill-compatible and separate from submission",mode=>{
    render(<AuthForm {...props} mode={mode}/>);
    const input=screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");expect(input.autocomplete).toBe(mode==="register"?"new-password":"current-password");expect(input.name).toBe("password");expect(input.required).toBe(true);
    fireEvent.change(input,{target:{value:"synthetic-password-not-a-secret"}});
    const eye=screen.getByRole("button",{name:"Show password"}) as HTMLButtonElement;
    expect(eye.type).toBe("button");expect(eye.getAttribute("aria-controls")).toBe(input.id);
    const location=window.location.href;
    fireEvent.click(eye);expect(input.type).toBe("text");expect(input.value).toBe("synthetic-password-not-a-secret");
    fireEvent.click(screen.getByRole("button",{name:"Hide password"}));expect(input.type).toBe("password");
    for(const dispatch of Object.values(harness.dispatch))expect(dispatch).not.toHaveBeenCalled();
    expect(window.location.href).toBe(location);
    expect(new FormData(input.form!).get("password")).toBe("synthetic-password-not-a-secret");
  });
  it("keeps the main sign-in action first for implicit Enter while recovery bypasses password validation",()=>{
    render(<AuthForm {...props}/>);const [primary,reset,resend]=submitButtons();
    const form=primary.closest("form")!;
    const submitters=Array.from(form.querySelectorAll<HTMLButtonElement>('button[type="submit"],button:not([type])'));
    expect(submitters[0]).toBe(primary);expect(primary.formNoValidate).toBe(false);
    expect(reset.type).toBe("submit");expect(resend.type).toBe("submit");expect(reset.formNoValidate).toBe(true);expect(resend.formNoValidate).toBe(true);
    expect((screen.getByLabelText("Work email") as HTMLInputElement).type).toBe("email");expect((screen.getByLabelText("Work email") as HTMLInputElement).autocomplete).toBe("email");
  });
  it("blocks every authentication submitter until a configured security check completes and again on expiration",()=>{
    render(<AuthForm {...props} captchaSiteKey="public-synthetic-site-key"/>);
    expect(submitButtons().every(button=>button.disabled)).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));expect(submitButtons().every(button=>!button.disabled)).toBe(true);
    const form=screen.getByLabelText("Work email").closest("form")!;
    expect(new FormData(form).get("captchaToken")).toBe("synthetic-widget-token");
    fireEvent.click(screen.getByRole("button",{name:"Expire security check"}));expect(submitButtons().every(button=>button.disabled)).toBe(true);expect(new FormData(form).get("captchaToken")).toBe("");
  });
  it.each([undefined,"   "])("does not require a browser challenge when the configured site key is %s",captchaSiteKey=>{
    render(<AuthForm {...props} captchaSiteKey={captchaSiteKey}/>);expect(submitButtons().every(button=>!button.disabled)).toBe(true);expect(screen.queryByRole("button",{name:"Complete security check"})).toBeNull();
  });
  it.each(["primary","reset","resend"] as const)("resets the consumed captcha after the %s action finishes",key=>{
    const {rerender}=render(<AuthForm {...props} captchaSiteKey="public-synthetic-site-key"/>);
    fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));expect(submitButtons().every(button=>!button.disabled)).toBe(true);
    harness.pending[key]=true;rerender(<AuthForm {...props} captchaSiteKey="public-synthetic-site-key"/>);
    expandHelp();
    const actions=screen.getByLabelText("Work email").closest("form")!.querySelectorAll<HTMLButtonElement>('button[type="submit"],button:not([type])');
    expect(Array.from(actions).every(button=>button.disabled)).toBe(true);
    harness.pending[key]=false;rerender(<AuthForm {...props} captchaSiteKey="public-synthetic-site-key"/>);
    expect(harness.captchaResets).toContain(1);expect(submitButtons().every(button=>button.disabled)).toBe(true);
    fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));expect(submitButtons().every(button=>!button.disabled)).toBe(true);
  });
  it.each(["primary","reset","resend"] as const)("keeps all submitters disabled while %s is pending without requiring captcha",key=>{
    harness.pending[key]=true;render(<AuthForm {...props}/>);expandHelp();
    const form=screen.getByLabelText("Work email").closest("form")!;
    expect(form.getAttribute("aria-busy")).toBe("true");
    const actions=form.querySelectorAll<HTMLButtonElement>('button[type="submit"],button:not([type])');
    expect(Array.from(actions).every(button=>button.disabled)).toBe(true);
  });
  it("preserves an invitation destination in the form and alternate registration link",()=>{
    const next=`/invite/${"a".repeat(64)}`;
    render(<AuthForm {...props} next={next}/>);
    expect(new FormData(screen.getByLabelText("Work email").closest("form")!).get("next")).toBe(next);
    expect(screen.getByRole("link",{name:"Create invited account"}).getAttribute("href")).toBe(`/register?next=${encodeURIComponent(next)}`);
    expect(screen.queryByLabelText("Organisation name")).toBeNull();
  });
  it("retains all owner-registration fields but excludes them for controlled invited accounts",()=>{
    const {rerender}=render(<AuthForm {...props} mode="register"/>);
    for(const [label,name,autocomplete] of [["Full name","name","name"],["Organisation name","organisationName","organization"],["Organisation URL name","organisationSlug",""]] as const){
      const input=screen.getByLabelText(label) as HTMLInputElement;expect(input.name).toBe(name);expect(input.required).toBe(true);expect(input.autocomplete).toBe(autocomplete);
    }
    expect(screen.getByRole("button",{name:"Register organisation"})).toBeTruthy();
    const next=`/invite/${"b".repeat(64)}`;rerender(<AuthForm {...props} mode="register" next={next}/>);
    expect(screen.getByLabelText("Full name")).toBeTruthy();expect(screen.queryByLabelText("Organisation name")).toBeNull();expect(screen.queryByLabelText("Organisation URL name")).toBeNull();
    expect(screen.getByRole("button",{name:"Create invited account"})).toBeTruthy();expect(screen.getByRole("link",{name:"Sign in"}).getAttribute("href")).toBe(`/login?next=${encodeURIComponent(next)}`);
  });
  it("retains access-denied and inactivity notices without hiding required access guidance",()=>{
    render(<AuthForm {...props} accessDenied notice="You've been signed out due to inactivity. Please sign in again to continue."/>);
    expect(screen.getByText(/no active EngiCite organisation or authorised project role/)).toBeTruthy();expect(screen.getByRole("status").textContent).toContain("signed out due to inactivity");
  });
  it("keeps recovery feedback visible outside the collapsed verification-help panel",()=>{
    harness.feedback.reset={message:"If the email belongs to an account, a recovery message will arrive."};
    render(<AuthForm {...props}/>);
    const message=screen.getByRole("status");expect(message.textContent).toContain("a recovery message will arrive");expect(message.closest("details")).toBeNull();
    const help=screen.getByText("Need help signing in?").closest("details")!;expect(help.open).toBe(false);
  });
  it("opens verification help for returned feedback and preserves accessible email error association",()=>{
    harness.feedback.resend={message:"Check the work email used to register.",errors:{email:["Enter a valid work email."]}};
    render(<AuthForm {...props}/>);
    expect(screen.getByText("Need help signing in?").closest("details")?.open).toBe(true);
    const input=screen.getByLabelText("Work email") as HTMLInputElement;
    expect(input.getAttribute("aria-invalid")).toBe("true");expect(document.getElementById(input.getAttribute("aria-describedby")!)?.textContent).toBe("Enter a valid work email.");
    expect(screen.getByRole("status").textContent).toBe("Check the work email used to register.");
  });
  it("keeps the existing-account sign-in guidance explicit and preserves an invitation return path",()=>{
    const next=`/invite/${"e".repeat(64)}`;harness.feedback.primary={showLogin:true,message:"This account may already be registered."};
    render(<AuthForm {...props} mode="register" next={next}/>);
    expect(screen.getByRole("alert").textContent).toContain("Do not wait for another email");
    expect(screen.getByRole("link",{name:"Sign in instead"}).getAttribute("href")).toBe(`/login?next=${encodeURIComponent(next)}`);
    expect(harness.dispatch.primary).not.toHaveBeenCalled();
  });
  it("retains exact scoped login payload fields and dispatches only the selected action",async()=>{
    const next=`/invite/${"c".repeat(64)}`;render(<AuthForm {...props} next={next} captchaSiteKey="public-synthetic-site-key"/>);
    fireEvent.change(screen.getByLabelText("Work email"),{target:{value:"synthetic@example.test"}});fireEvent.change(screen.getByLabelText("Password"),{target:{value:"synthetic-password-not-a-secret"}});fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));
    const [primary]=submitButtons(),form=primary.closest("form")!;
    expect(Object.fromEntries(new FormData(form))).toEqual({next,email:"synthetic@example.test",password:"synthetic-password-not-a-secret",captchaToken:"synthetic-widget-token"});
    await act(async()=>{fireEvent(form,new SubmitEvent("submit",{bubbles:true,cancelable:true,submitter:primary}));});
    expect(harness.dispatch.primary).toHaveBeenCalledTimes(1);expect(harness.dispatch.reset).not.toHaveBeenCalled();expect(harness.dispatch.resend).not.toHaveBeenCalled();
  });
  it.each(["reset","resend"] as const)("keeps the %s formAction separate and carries the invitation/email/token without requiring a password",async key=>{
    const next=`/invite/${"d".repeat(64)}`;render(<AuthForm {...props} next={next} captchaSiteKey="public-synthetic-site-key"/>);
    fireEvent.change(screen.getByLabelText("Work email"),{target:{value:"synthetic@example.test"}});fireEvent.click(screen.getByRole("button",{name:"Complete security check"}));
    const [,reset,resend]=submitButtons(),button=key==="reset"?reset:resend;
    expect(button.formNoValidate).toBe(true);
    await act(async()=>{fireEvent(button.form!,new SubmitEvent("submit",{bubbles:true,cancelable:true,submitter:button}));});
    expect(harness.dispatch[key]).toHaveBeenCalledTimes(1);expect(harness.dispatch.primary).not.toHaveBeenCalled();
    const data=harness.dispatch[key].mock.calls[0][0];expect(data.get("next")).toBe(next);expect(data.get("email")).toBe("synthetic@example.test");expect(data.get("captchaToken")).toBe("synthetic-widget-token");expect(data.get("password")).toBe("");
  });
});
