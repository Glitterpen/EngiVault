import {afterEach,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import Link from "next/link";
import AuthLayout from "./layout";

const route=vi.hoisted(()=>({pathname:"/login"}));
vi.mock("next/navigation",()=>({usePathname:()=>route.pathname}));
vi.mock("@/components/brand",()=>({Brand:()=> <Link href="/" aria-label="EngiCite home">EngiCite</Link>}));
afterEach(()=>{cleanup();route.pathname="/login";});

it("gives login a focused single-column surface without a competing marketing heading",()=>{
 render(<AuthLayout><h1>Welcome back</h1><form aria-label="Sign in form"><label>Work email<input name="email"/></label></form></AuthLayout>);
 expect(screen.getAllByRole("main")).toHaveLength(1);
 expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
 expect(screen.getByRole("region",{name:"EngiCite sign in"})).toBeTruthy();
 expect(screen.getByRole("link",{name:"EngiCite home"}).getAttribute("href")).toBe("/");
 expect(screen.queryByText("One controlled record from planned deliverable to client issue.")).toBeNull();
 expect(screen.getByText("EngiCite · Engineering delivery, connected.")).toBeTruthy();
});

it.each(["/register","/founder-access","/auth/recover","/auth/update-password","/organisation/setup"])("keeps the existing layout for %s",pathname=>{
 route.pathname=pathname;
 render(<AuthLayout><p>Original authentication flow</p></AuthLayout>);
 expect(screen.getByRole("heading",{name:"One controlled record from planned deliverable to client issue."})).toBeTruthy();
 expect(screen.getByText("Original authentication flow")).toBeTruthy();
 expect(screen.queryByRole("region",{name:"EngiCite sign in"})).toBeNull();
});
