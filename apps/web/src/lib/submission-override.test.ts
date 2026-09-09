import {describe,expect,it} from "vitest";
import {submissionOverrideMessage,TRANSMITTED_OVERRIDE_WARNING} from "./submission-override";
describe("safe override messages",()=>{
  it("uses the next-revision warning at registration and completion",()=>expect(submissionOverrideMessage("override_already_transmitted")).toBe(TRANSMITTED_OVERRIDE_WARNING));
  it.each(["override_unavailable","override_not_current","override_issue_status_mismatch"])("explains %s",reason=>expect(submissionOverrideMessage(reason)).toBeTruthy());
  it("does not expose arbitrary database messages",()=>expect(submissionOverrideMessage("private internal error detail")).toBeNull());
});
