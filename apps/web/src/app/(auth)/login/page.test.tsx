import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import type {ComponentProps} from "react";
import LoginPage,{metadata} from "./page";
import {AuthForm} from "@/components/auth-form";
import {login,requestPasswordReset,resendVerification} from "../actions";

vi.mock("@/components/auth-form",()=>({AuthForm:vi.fn(()=>null)}));
vi.mock("../actions",()=>({login:vi.fn(),requestPasswordReset:vi.fn(),resendVerification:vi.fn()}));

type Query=Awaited<Parameters<typeof LoginPage>[0]["searchParams"]>;
async function pageProps(query:Query={}){
  const element=await LoginPage({searchParams:Promise.resolve(query)});
  expect(element.type).toBe(AuthForm);
  return element.props as ComponentProps<typeof AuthForm>;
}
const notices={
  expired:"You've been signed out due to inactivity. Please sign in again to continue.",
  queued:"The organisation and all project access records were deleted. Account email removal is securely queued for automatic retry.",
  deleted:"The organisation, project appointments, assignments and organisation-linked account email were removed successfully.",
  updated:"Password updated successfully. Sign in with your new password.",
  passwordUnavailable:"This password-reset link is unavailable, expired or has already been used. Request a fresh reset email below.",
  verified:"Your email address has been verified successfully. Sign in to continue to your organisation or project invitation.",
  verificationUnavailable:"This verification link is unavailable or has already been used. If your email is already verified, sign in below.",
};
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY","synthetic-public-site-key-for-tests");});
afterEach(()=>vi.unstubAllEnvs());

describe("login route feedback and authentication wiring",()=>{
  it("keeps sign-in metadata and passes the original login, verification and recovery actions",async()=>{
    const props=await pageProps();
    expect(metadata).toEqual({title:"Sign in | EngiCite"});
    expect(props).toEqual({mode:"login",action:login,resendAction:resendVerification,resetAction:requestPasswordReset,next:undefined,accessDenied:false,notice:undefined,captchaSiteKey:"synthetic-public-site-key-for-tests"});
    expect(login).not.toHaveBeenCalled();expect(resendVerification).not.toHaveBeenCalled();expect(requestPasswordReset).not.toHaveBeenCalled();
  });
  it.each([`/invite/${"a".repeat(64)}`,"/app/organisation/projects/project/overview?tab=delivery","/founder"])("forwards next unchanged to the existing form boundary: %s",async next=>{
    expect((await pageProps({next})).next).toBe(next);
  });
  it.each([["required",true],["other",false],[undefined,false]] as const)("only enables access-denied guidance for access=%s",async(access,denied)=>{
    expect((await pageProps({access})).accessDenied).toBe(denied);
  });
  it.each([
    ["inactive session",{session:"expired"},notices.expired],
    ["queued deleted identity",{organisation:"deleted",identity:"queued"},notices.queued],
    ["completed organisation deletion",{organisation:"deleted"},notices.deleted],
    ["completed deletion with another identity flag",{organisation:"deleted",identity:"complete"},notices.deleted],
    ["updated password",{password:"updated"},notices.updated],
    ["unavailable password reset",{password:"unavailable"},notices.passwordUnavailable],
    ["verified email",{verified:"success"},notices.verified],
    ["unavailable verification",{verification:"unavailable"},notices.verificationUnavailable],
  ] as const)("retains the exact notice for %s",async(_description,query,notice)=>{
    expect((await pageProps(query)).notice).toBe(notice);
  });
  it.each([
    ["session before all other flags",{session:"expired",organisation:"deleted",identity:"queued",password:"updated",verified:"success",verification:"unavailable"},notices.expired],
    ["queued deletion before password and verification",{organisation:"deleted",identity:"queued",password:"updated",verified:"success",verification:"unavailable"},notices.queued],
    ["completed deletion before password and verification",{organisation:"deleted",password:"unavailable",verified:"success",verification:"unavailable"},notices.deleted],
    ["password update before email verification",{password:"updated",verified:"success",verification:"unavailable"},notices.updated],
    ["password reset unavailable before email verification",{password:"unavailable",verified:"success",verification:"unavailable"},notices.passwordUnavailable],
    ["verified email before unavailable verification",{verified:"success",verification:"unavailable"},notices.verified],
  ] as const)("preserves notice precedence: %s",async(_description,query,notice)=>{
    expect((await pageProps(query)).notice).toBe(notice);
  });
  it("does not invent notices for unknown query flags and keeps independent access and next fields",async()=>{
    const next=`/invite/${"b".repeat(64)}`;
    const props=await pageProps({next,access:"required",session:"other",organisation:"other",identity:"queued",password:"other",verified:"other",verification:"other"});
    expect(props.notice).toBeUndefined();expect(props.next).toBe(next);expect(props.accessDenied).toBe(true);
  });
  it("forwards only a synthetic configured site key, without substituting or reading credentials",async()=>{
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY","another-synthetic-public-site-key");
    expect((await pageProps()).captchaSiteKey).toBe("another-synthetic-public-site-key");
    vi.stubEnv("NEXT_PUBLIC_TURNSTILE_SITE_KEY",undefined);
    expect((await pageProps()).captchaSiteKey).toBeUndefined();
  });
});
