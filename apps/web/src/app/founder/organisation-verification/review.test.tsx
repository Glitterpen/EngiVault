import {cleanup,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {revalidatePath} from "next/cache";
import {requireAuthenticatedUser} from "@/lib/auth";
import {requireFounderIdentity,type FounderAccess} from "@/lib/founder";
import {reviewOrganisationVerification} from "./actions";
import OrganisationVerificationReviewPage from "./page";
import {OrganisationVerificationReviewForm} from "./review-form";

vi.mock("next/cache",()=>({revalidatePath:vi.fn()}));
vi.mock("@/lib/auth",()=>({requireAuthenticatedUser:vi.fn()}));
vi.mock("@/lib/founder",()=>({requireFounderIdentity:vi.fn()}));
vi.mock("@/components/founder-mfa-gate",()=>({FounderMfaGate:({continueTo}:{continueTo:string})=><p>Verify your authenticator to continue to {continueTo}</p>}));

const requestId="39000000-0000-4000-8000-000000000001";
const path="/founder/organisation-verification";
const applicant={
  id:requestId,applicant_name:"Example Applicant",organisation_name:"Example Engineering",organisation_slug:"example-engineering",
  claimed_domain:"example.test",work_email:"employee@engineering.test",status:"pending",submitted_at:"2026-11-16T12:00:00Z",
  decided_at:null,expires_at:null,workspace_id:null,
};
const aal2Founder:FounderAccess={is_founder:true,access_status:"active",require_mfa:true,current_aal:"aal2",authorised:true};
const aal1Founder:FounderAccess={...aal2Founder,require_mfa:false,current_aal:"aal1"};
const rpc=vi.fn();

function decisionForm(decision="approve"){
  const form=new FormData();
  form.set("requestId",requestId);
  form.set("decision",decision);
  if(decision==="approve")for(const [name,value] of Object.entries({
    representativeName:"  Example Officer  ",representativeRole:"IT director",confirmationMethod:"company_phone",
    confirmationReference:"Published switchboard, confirmation 16 Nov",verifiedWorkDomain:" Engineering.test ",
    independentRepresentative:"confirmed",affiliationConfirmed:"confirmed",authorityConfirmed:"confirmed",
  }))form.set(name,value);
  return form;
}

beforeEach(()=>{
  vi.resetAllMocks();
  vi.mocked(requireFounderIdentity).mockResolvedValue(aal2Founder);
  vi.mocked(requireAuthenticatedUser).mockResolvedValue({supabase:{rpc}} as never);
  rpc.mockResolvedValue({data:null,error:null});
});
afterEach(cleanup);

it("does not load applicant details or permit review from an AAL1 founder session",async()=>{
  vi.mocked(requireFounderIdentity).mockResolvedValue(aal1Founder);
  render(await OrganisationVerificationReviewPage());
  expect(screen.getByText(`Verify your authenticator to continue to ${path}`)).toBeTruthy();
  expect(screen.queryByText("Pending requests")).toBeNull();
  expect(await reviewOrganisationVerification(undefined,decisionForm())).toEqual({kind:"error",message:expect.stringContaining("authenticator")});
  expect(requireAuthenticatedUser).not.toHaveBeenCalled();
  expect(rpc).not.toHaveBeenCalled();
});

it("preserves the founder identity gate rather than loading the queue for non-founders",async()=>{
  vi.mocked(requireFounderIdentity).mockRejectedValue(new Error("not found"));
  await expect(OrganisationVerificationReviewPage()).rejects.toThrow("not found");
  await expect(reviewOrganisationVerification(undefined,decisionForm())).rejects.toThrow("not found");
  expect(rpc).not.toHaveBeenCalled();
});

it("shows the pending application and flags a work domain that needs manual corroboration",async()=>{
  rpc.mockResolvedValue({data:[applicant],error:null});
  render(await OrganisationVerificationReviewPage());
  expect(rpc).toHaveBeenCalledExactlyOnceWith("list_organisation_verification_requests");
  expect(screen.getByRole("heading",{name:"Organisation verification",level:1})).toBeTruthy();
  const request=screen.getByRole("article",{name:"Example Engineering"});
  expect(within(request).getByText("Example Applicant")).toBeTruthy();
  expect(within(request).getByText("employee@engineering.test")).toBeTruthy();
  expect(within(request).getByText(/differs from the claimed company domain/)).toBeTruthy();
  expect(within(request).queryByRole("link")).toBeNull();
});

it("fails closed without displaying applicant details if a queue response is invalid",async()=>{
  rpc.mockResolvedValue({data:[{...applicant,status:"approved"}],error:null});
  render(await OrganisationVerificationReviewPage());
  expect(screen.getByRole("alert").textContent).toContain("temporarily unavailable");
  expect(screen.queryByText("Example Applicant")).toBeNull();
});

it("marks all three independent confirmation checkboxes as required",()=>{
  render(<OrganisationVerificationReviewForm requestId={requestId}/>);
  const form=screen.getByRole("form",{name:"Record company confirmation"});
  const checkboxes=within(form).getAllByRole("checkbox");
  expect(checkboxes).toHaveLength(3);
  expect(checkboxes.every(box=>(box as HTMLInputElement).required)).toBe(true);
  expect(within(form).getByRole("textbox",{name:"Verified work-email domain"}).getAttribute("value")).toBeNull();
});

it.each(["independentRepresentative","affiliationConfirmed","authorityConfirmed"])("does not record approval without %s",async name=>{
  const form=decisionForm();
  form.delete(name);
  expect((await reviewOrganisationVerification(undefined,form))?.kind).toBe("error");
  expect(rpc).not.toHaveBeenCalled();
  expect(revalidatePath).not.toHaveBeenCalled();
});

it("rejects competing checkbox or decision values",async()=>{
  const form=decisionForm();
  form.append("affiliationConfirmed","confirmed");
  expect((await reviewOrganisationVerification(undefined,form))?.kind).toBe("error");
  form.append("decision","reject");
  expect((await reviewOrganisationVerification(undefined,form))?.kind).toBe("error");
  expect(rpc).not.toHaveBeenCalled();
});

it("records only scoped company confirmation and refreshes the queue",async()=>{
  expect((await reviewOrganisationVerification(undefined,decisionForm()))?.kind).toBe("success");
  expect(rpc).toHaveBeenCalledExactlyOnceWith("review_organisation_verification",{
    target_request:requestId,decision:"approve",representative_name:"Example Officer",representative_role:"IT director",
    confirmation_method:"company_phone",confirmation_reference:"Published switchboard, confirmation 16 Nov",
    verified_work_domain:"engineering.test",affiliation_confirmed:true,authority_confirmed:true,
  });
  expect(revalidatePath).toHaveBeenCalledExactlyOnceWith(path);
});

it("declines only the verification request without claiming that company evidence was supplied",async()=>{
  expect((await reviewOrganisationVerification(undefined,decisionForm("reject")))?.kind).toBe("success");
  expect(rpc).toHaveBeenCalledExactlyOnceWith("review_organisation_verification",{
    target_request:requestId,decision:"reject",representative_name:null,representative_role:null,confirmation_method:null,
    confirmation_reference:null,verified_work_domain:null,affiliation_confirmed:false,authority_confirmed:false,
  });
});

it("returns safe feedback on a conflicting or already decided request",async()=>{
  rpc.mockResolvedValue({data:null,error:{code:"P0002",message:"Private review and email details."}});
  expect(await reviewOrganisationVerification(undefined,decisionForm())).toEqual({kind:"error",message:"This request is no longer available for review. Refresh the queue."});
  expect(revalidatePath).not.toHaveBeenCalled();
});
