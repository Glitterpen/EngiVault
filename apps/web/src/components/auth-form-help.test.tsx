import {afterEach,describe,expect,it} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {AuthForm} from "./auth-form";
const noAction=async()=>undefined;
const actions={action:noAction,resendAction:noAction,resetAction:noAction};
afterEach(cleanup);
describe("authentication guidance",()=>{
 it("places registration hints behind field icons and retains sign-in recovery actions",()=>{
  render(<AuthForm mode="register" {...actions}/>);
  expect(screen.getByLabelText("Organisation URL name").tagName).toBe("INPUT");
  expect(screen.queryByText(/Lowercase letters/)).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Organisation URL name guidance"}));
  expect(screen.getByRole("tooltip").textContent).toContain("Lowercase letters");
  expect(screen.getByRole("button",{name:"Forgot password?"})).toBeTruthy();
  expect(screen.getByRole("button",{name:"Account not verified? Resend verification"})).toBeTruthy();
 });
 it("never hides access errors or verification notices behind help",()=>{
  render(<AuthForm mode="login" {...actions} accessDenied notice="Your email is verified. Sign in to continue."/>);
  expect(screen.getByText(/This account has no active EngiCite organisation/)).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("Your email is verified. Sign in to continue.");
  expect(screen.queryByRole("tooltip")).toBeNull();
 });
});
