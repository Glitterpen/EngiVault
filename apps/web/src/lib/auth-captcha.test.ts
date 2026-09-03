import {describe,expect,it} from "vitest";
import {captchaFailureMessage,isCaptchaFailure,readAuthCaptchaSubmission} from "./auth-captcha";

describe("readAuthCaptchaSubmission",()=>{
  it("does not require a token before a Turnstile site key is configured",()=>{
    expect(readAuthCaptchaSubmission(new FormData(),"")).toEqual({ok:true});
  });

  it("requires a token when Turnstile is configured",()=>{
    expect(readAuthCaptchaSubmission(new FormData(),"public-site-key")).toEqual({
      ok:false,
      message:"Complete the security verification, then try again.",
    });
  });

  it("returns a trimmed token for Supabase Auth",()=>{
    const formData=new FormData();
    formData.set("captchaToken","  verified-token  ");
    expect(readAuthCaptchaSubmission(formData,"public-site-key")).toEqual({
      ok:true,
      captchaToken:"verified-token",
    });
  });

  it("rejects an implausibly large token",()=>{
    const formData=new FormData();
    formData.set("captchaToken","x".repeat(4097));
    expect(readAuthCaptchaSubmission(formData,"public-site-key").ok).toBe(false);
  });
});

describe("CAPTCHA error mapping",()=>{
  it("recognises Supabase CAPTCHA failures",()=>{
    expect(isCaptchaFailure({code:"captcha_failed"})).toBe(true);
    expect(isCaptchaFailure({code:"invalid_credentials"})).toBe(false);
    expect(captchaFailureMessage).toContain("Security verification");
  });
});
