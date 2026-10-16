import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {ComponentProps} from "react";
import RegisterPage,{metadata} from "./page";
import {AuthForm} from "@/components/auth-form";
import {register,requestPasswordReset,resendVerification} from "../actions";

vi.mock("@/components/auth-form",()=>({AuthForm:vi.fn(()=>null)}));
vi.mock("../actions",()=>({register:vi.fn(),requestPasswordReset:vi.fn(),resendVerification:vi.fn()}));
async function props(next?:string){const element=await RegisterPage({searchParams:Promise.resolve({next})});expect(element.type).toBe(AuthForm);return element.props as ComponentProps<typeof AuthForm>;}
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY","synthetic-public-registration-site-key");});
afterEach(()=>vi.unstubAllEnvs());

describe("registration route wiring",()=>{
  it("provides registration metadata and preserves the three original server actions",async()=>{
    expect(metadata).toEqual({title:"Register your organisation"});
    expect(await props()).toEqual({mode:"register",action:register,resendAction:resendVerification,resetAction:requestPasswordReset,next:undefined,captchaSiteKey:"synthetic-public-registration-site-key"});
    expect(register).not.toHaveBeenCalled();expect(resendVerification).not.toHaveBeenCalled();expect(requestPasswordReset).not.toHaveBeenCalled();
  });
  it.each([`/invite/${"a".repeat(64)}`,"/organisation/setup","/app?section=project"])("preserves next without changing registration semantics: %s",async next=>{
    const registration=await props(next);expect(registration.next).toBe(next);expect(registration.mode).toBe("register");expect(registration.action).toBe(register);
  });
  it("forwards the configured public CAPTCHA site key using synthetic test values only",async()=>{
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY","another-synthetic-public-site-key");expect((await props()).captchaSiteKey).toBe("another-synthetic-public-site-key");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY",undefined);expect((await props()).captchaSiteKey).toBeUndefined();
  });
});
