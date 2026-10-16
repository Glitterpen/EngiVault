import {describe,expect,it} from "vitest";
import {protectedSignInPath,protectedSignInUrl} from "./protected-route";

describe("protectedSignInPath",()=>{
  it("keeps organisation workspaces on the organisation login",()=>{
    expect(protectedSignInPath("/app")).toBe("/login");
    expect(protectedSignInPath("/app/example/projects/example")).toBe("/login");
  });

  it("routes every founder page through the dedicated founder login",()=>{
    expect(protectedSignInPath("/founder")).toBe("/founder-access");
    expect(protectedSignInPath("/founder/deleted")).toBe("/founder-access");
  });
});

describe("protectedSignInUrl",()=>{
  it("retains the validated workspace path and query after inactivity",()=>{
    const path="/app/organisation/projects/project/interdisciplinary";
    const search="?discipline=Electrical&q=Design%20basis&page=3";
    const result=new URL(protectedSignInUrl(path,search,"expired"),"https://engicite.example");
    expect(result.pathname).toBe("/login");
    expect(result.searchParams.get("session")).toBe("expired");
    expect(result.searchParams.get("next")).toBe(path+search);
  });

  it.each(["/founder","/founder/deleted"])("returns founder page %s to the dedicated founder login with its query",path=>{
    const result=new URL(protectedSignInUrl(path,"?q=Example","expired"),"https://engicite.example");
    expect(result.pathname).toBe("/founder-access");
    expect(result.searchParams.get("next")).toBe(path+"?q=Example");
    expect(result.searchParams.get("session")).toBe("expired");
  });

  it("retains a safe return when an existing session ends without declaring an idle timeout",()=>{
    const result=new URL(protectedSignInUrl("/app/example","?view=grouped"),"https://engicite.example");
    expect(result.searchParams.get("next")).toBe("/app/example?view=grouped");
    expect(result.searchParams.has("session")).toBe(false);
  });

  it.each(["https://attacker.example/path","//attacker.example/path","/app\\redirect","/login","/app\nLocation:https://attacker.example"])("never uses unsafe or unsupported path %s as a return destination",path=>{
    const result=new URL(protectedSignInUrl(path,"","expired"),"https://engicite.example");
    expect(result.pathname).toBe("/login");
    expect(result.searchParams.get("next")).toBe("/app");
  });
});
