import {act,cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {AuthForm} from "./auth-form";
import type {AuthState} from "@/app/(auth)/actions";

vi.mock("@/components/auth-turnstile",()=>({AuthTurnstile:()=>null}));
const noAction=async()=>undefined;
const actions={action:noAction,resendAction:noAction,resetAction:noAction};
afterEach(cleanup);

describe("clean authentication form",()=>{
  it("provides one concise login heading and a clear named form",()=>{
    render(<AuthForm mode="login" {...actions}/>);
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(screen.getByRole("heading",{level:1,name:"Welcome back"})).toBeTruthy();
    expect(screen.getByText("Sign in to your engineering workspace.")).toBeTruthy();
    expect(screen.getByRole("form",{name:"Welcome back"})).toBeTruthy();
    expect(screen.queryByText("Organisation-controlled access")).toBeNull();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  it("starts verification guidance collapsed while retaining a quiet recovery action",()=>{
    render(<AuthForm mode="login" {...actions}/>);
    const summary=screen.getByText("Need help signing in?",{selector:"summary"});
    expect(summary.closest("details")?.open).toBe(false);
    // jsdom does not fully model closed-details visibility; the native browser
    // check covers visibility, while this verifies the disclosure containment.
    expect(screen.getByRole("button",{name:"Account not verified? Resend verification",hidden:true}).closest("details")).toBe(summary.closest("details"));
    const recovery=screen.getByRole("button",{name:"Forgot password?"});
    expect(recovery.classList.contains("min-h-11")).toBe(true);
    expect(recovery.classList.contains("ev-button-secondary")).toBe(false);
    fireEvent.click(summary);
    expect(screen.getByRole("button",{name:"Account not verified? Resend verification"})).toBeTruthy();
  });
  it("keeps required email/password labels, error descriptions and touch targets",async()=>{
    const action=vi.fn(async():Promise<AuthState>=>({errors:{email:["Enter a valid email address."],password:["Enter your password."]}}));
    render(<AuthForm mode="login" {...actions} action={action}/>);
    const email=screen.getByLabelText("Work email") as HTMLInputElement;
    const password=screen.getByLabelText("Password") as HTMLInputElement;
    expect(email.required).toBe(true);expect(password.required).toBe(true);
    expect(email.getAttribute("autocomplete")).toBe("email");expect(password.getAttribute("autocomplete")).toBe("current-password");
    for(const input of [email,password])expect(input.classList.contains("min-h-11")).toBe(true);
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Welcome back"}));});
    for(const [input,message] of [[email,"Enter a valid email address."],[password,"Enter your password."]] as const){
      expect(input.getAttribute("aria-invalid")).toBe("true");
      const error=document.getElementById(input.getAttribute("aria-describedby")!);
      expect(error?.textContent).toBe(message);expect(error?.getAttribute("role")).toBe("alert");
    }
  });
  it("keeps access denial and verified-email notices visible without opening optional guidance",()=>{
    render(<AuthForm mode="login" {...actions} accessDenied notice="Your email is verified. Sign in to continue."/>);
    expect(screen.getByRole("alert").textContent).toContain("This account has no active EngiCite organisation");
    expect(screen.getByRole("status").textContent).toBe("Your email is verified. Sign in to continue.");
    expect(screen.getByText("Need help signing in?",{selector:"summary"}).closest("details")?.open).toBe(false);
  });
  it("opens verification recovery when an unverified login returns the existing showResend state",async()=>{
    const action=vi.fn(async():Promise<AuthState>=>({message:"Your email has not been verified.",showResend:true}));
    render(<AuthForm mode="login" {...actions} action={action}/>);
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Welcome back"}));});
    expect(screen.getByRole("status").textContent).toBe("Your email has not been verified.");
    expect(screen.getByText("Need help signing in?",{selector:"summary"}).closest("details")?.open).toBe(true);
    expect(screen.getByRole("button",{name:"Account not verified? Resend verification"})).toBeTruthy();
  });
  it("reopens the verification disclosure when feedback returns after it was closed",async()=>{
    let finish:(state:AuthState)=>void=()=>{};
    const resendAction=vi.fn(()=>new Promise<AuthState>(resolve=>{finish=resolve;}));
    render(<AuthForm mode="login" {...actions} resendAction={resendAction}/>);
    const summary=screen.getByText("Need help signing in?",{selector:"summary"});
    fireEvent.click(summary);
    const resend=screen.getByRole("button",{name:"Account not verified? Resend verification"}) as HTMLButtonElement;
    await act(async()=>{fireEvent(resend.form!,new SubmitEvent("submit",{bubbles:true,cancelable:true,submitter:resend}));});
    fireEvent.click(summary);expect(summary.closest("details")?.open).toBe(false);
    await act(async()=>{finish({message:"If your account needs verification, a message has been sent."});});
    expect(summary.closest("details")?.open).toBe(true);
    expect(screen.getByRole("status").textContent).toBe("If your account needs verification, a message has been sent.");
  });
  it("keeps existing-account guidance visible and the sign-in alternative correctly scoped",async()=>{
    const next="/invite/"+"a".repeat(64);
    const action=vi.fn(async():Promise<AuthState>=>({message:"Use your existing account.",showLogin:true}));
    render(<AuthForm mode="register" {...actions} action={action} next={next}/>);
    await act(async()=>{fireEvent.submit(screen.getByRole("form",{name:"Create your invited account"}));});
    expect(screen.getByRole("alert").textContent).toContain("Already have an account? Do not wait for another email.");
    expect(screen.getByRole("link",{name:"Sign in instead"}).getAttribute("href")).toBe(`/login?next=${encodeURIComponent(next)}`);
    expect(screen.getByRole("link",{name:"Sign in instead"}).classList.contains("min-h-11")).toBe(true);
  });
});
