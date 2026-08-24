import {describe,expect,it} from "vitest";
import {deletedIdentityEmail,deletedIdentityPassword,validIdentityPurgeIds} from "./identity-purge-values";

const id="9b9e9b35-3811-44eb-988d-bb2b081b506c";

describe("deleted identity values",()=>{
  it("uses a deterministic non-deliverable address without retaining the original email",()=>{
    expect(deletedIdentityEmail(id)).toBe("deleted-9b9e9b35381144eb988dbb2b081b506c@deleted.invalid");
  });
  it("rejects malformed identity input",()=>expect(()=>deletedIdentityEmail("not-a-user")).toThrow("Invalid user identity"));
  it("creates an unusable high-entropy replacement password within the Supabase 72-character limit",()=>{
    const password=deletedIdentityPassword();
    expect(password.length).toBeGreaterThanOrEqual(64);
    expect(password.length).toBeLessThanOrEqual(72);
  });
  it("deduplicates and rejects untrusted queue values",()=>expect(validIdentityPurgeIds([id,id,null,"bad"])).toEqual([id]));
});
