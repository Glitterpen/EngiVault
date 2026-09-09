// @vitest-environment node
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {sendInvitationEmail} from "./invitation-email";
vi.mock("server-only",()=>({}));
const request=vi.fn();
beforeEach(()=>{vi.stubEnv("RESEND_API_KEY","test-only-key");vi.stubEnv("INVITATION_FROM_EMAIL","invites@example.test");vi.stubGlobal("fetch",request);request.mockResolvedValue({ok:true});});
afterEach(()=>{vi.unstubAllGlobals();vi.unstubAllEnvs();vi.clearAllMocks();});
const input={to:"engineer@example.test",acceptUrl:"https://example.test/invite/test-only",projectName:"Test project",organisationName:"Example Engineering",role:"engineer"};
describe("Multi-discipline invitation email",()=>{
  it("sends a private organisation-branded executive invitation without project details",async()=>{
    await sendInvitationEmail({...input,role:"executive_viewer",projectIntroduction:"Private project brief"});
    const body=JSON.parse(request.mock.calls[0][1].body);
    expect(body.to).toEqual([input.to]);
    expect(body.from).toContain("Example Engineering");
    expect(body.subject).toBe("Example Engineering: private executive access");
    expect(body.html).toContain("read-only");
    expect(body.html).toContain("authorised Organisation Administrators");
    expect(body.html).toContain("Create invited account");
    expect(body.html).not.toContain("Private project brief");
    expect(body.html).not.toContain("Test project");
  });
  it("includes every discipline in one organisation-branded email",async()=>{
    await sendInvitationEmail({...input,disciplines:["Electrical","Instrumentation","Controls & Automation"]});
    const body=JSON.parse(request.mock.calls[0][1].body);
    expect(body.to).toEqual([input.to]);
    expect(body.from).toContain("Example Engineering");
    expect(body.html).toContain("Electrical, Instrumentation, Controls &amp; Automation");
    expect(body.html).toContain("one account");
    expect(body.html).toContain("DCC-assigned");
  });
  it("preserves all scopes in the backwards-compatible resend summary",async()=>{
    await sendInvitationEmail({...input,discipline:"Electrical, Instrumentation",reminder:true});
    const body=JSON.parse(request.mock.calls[0][1].body);
    expect(body.html).toContain("Electrical, Instrumentation");
    expect(body.subject).toContain("reminder");
  });
  it("escapes untrusted discipline names",async()=>{
    await sendInvitationEmail({...input,disciplines:['<img src=x onerror="alert(1)">']});
    const body=JSON.parse(request.mock.calls[0][1].body);
    expect(body.html).not.toContain("<img");
    expect(body.html).toContain("&lt;img");
  });
});
