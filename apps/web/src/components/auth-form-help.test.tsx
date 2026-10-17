import {afterEach,describe,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {AuthForm} from "./auth-form";
const noAction=async()=>undefined;
const actions={action:noAction,resendAction:noAction,resetAction:noAction};
afterEach(cleanup);
describe("authentication guidance",()=>{
 it("removes generic sign-in help while keeping useful registration requirements",()=>{
  const {rerender}=render(<AuthForm mode="login" {...actions}/>);
  expect(screen.queryByRole("button",{name:"Signing in and organisation registration"})).toBeNull();
  expect(screen.getByText("Sign in to your engineering workspace.")).toBeTruthy();
  rerender(<AuthForm mode="register" {...actions}/>);
  fireEvent.click(screen.getByRole("button",{name:"Password guidance"}));
  expect(screen.getByRole("tooltip").textContent).toBe("Minimum 12 characters");
  fireEvent.keyDown(screen.getByRole("button",{name:"Password guidance"}),{key:"Escape"});
  fireEvent.click(screen.getByRole("button",{name:"Work email guidance"}));
  expect(screen.getByRole("tooltip").textContent).toContain("Use an email not already registered");
 });
 it("places registration hints behind field icons and retains sign-in recovery actions",()=>{
  render(<AuthForm mode="register" {...actions}/>);
  expect(screen.getByLabelText("Organisation URL name").tagName).toBe("INPUT");
  expect(screen.queryByText(/Lowercase letters/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Organisation URL name guidance"}));
  expect(screen.getByRole("tooltip").textContent).toContain("Lowercase letters");
  fireEvent.keyDown(screen.getByRole("button",{name:"Organisation URL name guidance"}),{key:"Escape"});
  fireEvent.click(screen.getByText("Need help registering?",{selector:"summary"}));
  expect(screen.getByRole("button",{name:"Forgot password?"})).toBeTruthy();
  expect(screen.getByRole("button",{name:"Account not verified? Resend verification"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button",{name:"Sign-in help"}));
  expect(screen.getByRole("tooltip").textContent).toBe("Enter your work email above before requesting a password reset or verification email.");
 });
 it("never hides access errors or verification notices behind help",()=>{
  render(<AuthForm mode="login" {...actions} accessDenied notice="Your email is verified. Sign in to continue."/>);
  expect(screen.getByText(/This account has no active EngiCite organisation/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Your email is verified. Sign in to continue.");
  expect(screen.queryByRole("tooltip")).toBeNull();
 });
});
