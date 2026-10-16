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

it("gives registration a focused wider surface without changing its child flow",()=>{
 route.pathname="/register";
 render(<AuthLayout><h1>Register your organisation</h1><form aria-label="Owner registration"><input name="organisationName"/></form></AuthLayout>);
 expect(screen.getAllByRole("main")).toHaveLength(1);
 expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
 const section=screen.getByRole("region",{name:"EngiCite registration"});
 expect(section.parentElement?.classList.contains("max-w-[560px]")).toBe(true);
 expect(section.contains(screen.getByRole("form",{name:"Owner registration"}))).toBe(true);
 expect(screen.queryByText("One controlled record from planned deliverable to client issue.")).toBeNull();
 expect(screen.getByRole("link",{name:"EngiCite home"}).getAttribute("href")).toBe("/");
});

it.each(["/founder-access","/auth/recover","/auth/update-password","/organisation/setup"])("keeps the existing layout for %s",pathname=>{
 route.pathname=pathname;
 render(<AuthLayout><p>Original authentication flow</p></AuthLayout>);
 expect(screen.getByRole("heading",{name:"One controlled record from planned deliverable to client issue."})).toBeTruthy();
 expect(screen.getByText("Original authentication flow")).toBeTruthy();
 expect(screen.queryByRole("region",{name:"EngiCite sign in"})).toBeNull();
});
