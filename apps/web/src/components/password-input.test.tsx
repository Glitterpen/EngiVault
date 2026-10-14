import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {PasswordInput} from "./password-input";
import {AuthForm} from "./auth-form";
import {FounderLoginForm} from "./founder-login-form";
import {PasswordUpdateForm} from "./password-update-form";
vi.mock("./auth-turnstile",()=>({AuthTurnstile:()=>null}));
afterEach(cleanup);
const action=vi.fn(async()=>undefined);
describe("password visibility",()=>{
  it("starts hidden, toggles both ways and preserves the form value without submitting",()=>{
    const submit=vi.fn(e=>e.preventDefault());
    render(<form onSubmit={submit}><label htmlFor="secret">Password</label><PasswordInput id="secret" name="password" autoComplete="current-password" required/></form>);
    const input=screen.getByLabelText("Password") as HTMLInputElement;
    expect(input.type).toBe("password");
    fireEvent.change(input,{target:{value:"example-only-password"}});
    fireEvent.click(screen.getByRole("button",{name:"Show password"}));
    expect(input.type).toBe("text");
    expect(new FormData(input.form!).get("password")).toBe("example-only-password");
    expect(input.autocomplete).toBe("current-password");
    fireEvent.click(screen.getByRole("button",{name:"Hide password"}));
    expect(input.type).toBe("password");expect(submit).not.toHaveBeenCalled();
  });
  it.each(["login","register"] as const)("adds a hidden-by-default toggle to %s",mode=>{
    render(<AuthForm mode={mode} action={action} resendAction={action} resetAction={action}/>);
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
    fireEvent.click(screen.getByRole("button",{name:"Show password"}));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
  });
  it("covers founder login",()=>{
    render(<FounderLoginForm action={action} resetAction={action}/>);
    fireEvent.click(screen.getByRole("button",{name:"Show password"}));
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("text");
  });
  it("keeps new and confirmation password toggles independent",()=>{
    render(<PasswordUpdateForm action={action} next="/app"/>);
    const first=screen.getByLabelText("New password") as HTMLInputElement;
    const second=screen.getByLabelText("Confirm new password") as HTMLInputElement;
    expect(first.type).toBe("password");expect(second.type).toBe("password");
    fireEvent.click(screen.getByRole("button",{name:"Show new password"}));
    expect(first.type).toBe("text");expect(second.type).toBe("password");
    expect(first.minLength).toBe(12);expect(second.maxLength).toBe(128);
  });
  it("respects disabled controls and describes the controlled input",()=>{
    render(<PasswordInput aria-label="Password" disabled/>);
    const button=screen.getByRole("button",{name:"Show password"}) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute("aria-controls")).toBe(screen.getByLabelText("Password").id);
    fireEvent.click(button);
    expect((screen.getByLabelText("Password") as HTMLInputElement).type).toBe("password");
  });
});
