// @vitest-environment node
import {beforeEach,expect,it,vi} from "vitest";
import {createOrganisation} from "@/app/app/actions";
import {requireAuthenticatedUser} from "@/lib/auth";
import {readAdminPreview} from "@/lib/admin-preview";
import type {OrganisationVerification} from "@/lib/organisation-verification";

const mocks=vi.hoisted(()=>({redirect:vi.fn((path:string)=>{throw new Error(`redirect:${path}`);})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("@/lib/auth",()=>({requireAuthenticatedUser:vi.fn()}));
vi.mock("@/lib/admin-preview",()=>({readAdminPreview:vi.fn()}));
vi.mock("@/lib/processor",()=>({buildProjectBackup:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
vi.mock("@/lib/identity-purge",()=>({processQueuedIdentityPurges:vi.fn()}));
const organisation={name:"Example Engineering",slug:"example-engineering"};
const orgId="82000000-0000-4000-8000-000000000001";
const confirmedAt="2026-11-01T10:00:00.000Z";
const approved:OrganisationVerification={
  id:"f0000000-0000-4000-8000-000000000001",applicant_name:"Example Engineer",organisation_name:organisation.name,
  organisation_slug:organisation.slug,claimed_domain:"example.test",work_email:"worker@example.test",status:"approved",
  submitted_at:"2026-11-14T09:00:00.000Z",decided_at:"2026-11-14T10:00:00.000Z",expires_at:"2026-11-28T10:00:00.000Z",workspace_id:null,
};

function organisationForm(mode?:"restore"){
  const form=new FormData();
  form.set("name",organisation.name);
  form.set("slug",organisation.slug);
  form.set("logo",new File([Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],"logo.png",{type:"image/png"}));
  if(mode)form.set("workspaceAction",mode);
  return form;
}

function signedIn({email="worker@example.test",emailConfirmedAt,organisationRoles=[],projectRoles=[],onboardingMode="organisation",request=null,createError,uploadError}:{
  email?:string;emailConfirmedAt?:string;organisationRoles?:string[];projectRoles?:string[];onboardingMode?:string;
  request?:OrganisationVerification|null;createError?:{code:string;message?:string};uploadError?:{message:string};
}={}){
  const rpc=vi.fn(async(name:string)=>{
    switch(name){
      case "get_my_organisations":return {data:organisationRoles.map(role=>({role})),error:null};
      case "get_my_organisation_verification":return {data:request,error:null};
      case "create_organisation":return createError?{data:null,error:createError}:{data:orgId,error:null};
      case "recover_created_organisation":return {data:orgId,error:null};
      case "update_organisation_identity":return {data:null,error:null};
      default:throw new Error(`Unexpected RPC: ${name}`);
    }
  });
  const upload=vi.fn().mockResolvedValue({error:uploadError??null});
  const updateUser=vi.fn().mockResolvedValue({error:null});
  const user={email,email_confirmed_at:emailConfirmedAt,user_metadata:{
    // Untrusted metadata cannot substitute for verification of the email identity.
    email_verified:true,email_confirmed_at:confirmedAt,onboarding_mode:onboardingMode,
    organisation_name:organisation.name,organisation_slug:organisation.slug,
  }};
  const supabase={rpc,
    from:vi.fn(()=>({select:vi.fn(()=>({limit:vi.fn().mockResolvedValue({data:projectRoles.map(role=>({role})),error:null})}))})),
    storage:{from:vi.fn(()=>({upload}))},auth:{updateUser},
  };
  vi.mocked(requireAuthenticatedUser).mockResolvedValue({user,supabase} as never);
  return {rpc,upload,updateUser};
}

beforeEach(()=>{vi.clearAllMocks();vi.mocked(readAdminPreview).mockResolvedValue(null);});

it.each([{}, {email:"",emailConfirmedAt:confirmedAt}])("does not create a first workspace without a verified email identity: %o",async(account)=>{
  const {rpc,upload,updateUser}=signedIn(account);
  await expect(createOrganisation(undefined,organisationForm())).resolves.toEqual({message:"Verify your work email before continuing with organisation setup."});
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_organisations");
  expect(upload).not.toHaveBeenCalled();
  expect(updateUser).not.toHaveBeenCalled();
});

it("creates the approved workspace for the exact verified first owner",async()=>{
  const {rpc,upload,updateUser}=signedIn({emailConfirmedAt:confirmedAt,request:approved});
  await expect(createOrganisation(undefined,organisationForm())).rejects.toThrow(`redirect:/app/${orgId}`);
  expect(rpc).toHaveBeenCalledWith("create_organisation",organisation);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(updateUser).toHaveBeenCalledWith({data:expect.objectContaining({onboarding_mode:null})});
});

it("preserves explicit restoration of a recoverable existing workspace without a new verification",async()=>{
  const {rpc,upload}=signedIn({emailConfirmedAt:confirmedAt,onboardingMode:"complete"});
  await expect(createOrganisation(undefined,organisationForm("restore"))).rejects.toThrow(`redirect:/app/${orgId}`);
  expect(rpc).toHaveBeenCalledWith("recover_created_organisation",{organisation_slug:organisation.slug});
  expect(rpc).not.toHaveBeenCalledWith("get_my_organisation_verification");
  expect(rpc).not.toHaveBeenCalledWith("create_organisation",expect.anything());
  expect(upload).toHaveBeenCalledTimes(1);
});

it("preserves additional workspace creation for existing admins after approval",async()=>{
  const {rpc,updateUser}=signedIn({organisationRoles:["organisation_admin"],onboardingMode:"complete",emailConfirmedAt:confirmedAt,request:approved});
  await expect(createOrganisation(undefined,organisationForm())).rejects.toThrow(`redirect:/app/${orgId}`);
  expect(rpc).toHaveBeenCalledWith("create_organisation",organisation);
  expect(updateUser).not.toHaveBeenCalled();
});

it("does not grant project members organisation creation even with confirmed work email",async()=>{
  const {rpc}=signedIn({emailConfirmedAt:confirmedAt,projectRoles:["document_controller"],request:approved});
  expect((await createOrganisation(undefined,organisationForm()))?.message).toContain("Project members cannot create organisations.");
  expect(rpc).not.toHaveBeenCalledWith("create_organisation",expect.anything());
});

it.each([
  null,{...approved,status:"pending"},{...approved,status:"rejected"},{...approved,status:"expired"},
  {...approved,status:"activated"},{...approved,work_email:"someone.else@example.test"},
  {...approved,organisation_name:"Other company"},{...approved,organisation_slug:"other-company"},
] satisfies (OrganisationVerification|null)[])("fails closed before activation if authorisation does not match exactly: %o",async(request)=>{
  const {rpc,upload}=signedIn({emailConfirmedAt:confirmedAt,request});
  expect((await createOrganisation(undefined,organisationForm()))?.message).toContain("must be approved for this exact workspace");
  expect(rpc).not.toHaveBeenCalledWith("create_organisation",expect.anything());
  expect(upload).not.toHaveBeenCalled();
});

it("does not let a founder decision expire between checks and create a workspace",async()=>{
  const {rpc,upload}=signedIn({emailConfirmedAt:confirmedAt,request:approved,createError:{code:"P0001",message:"approved organisation verification is required"}});
  expect((await createOrganisation(undefined,organisationForm()))?.message).toContain("must be approved");
  expect(rpc).toHaveBeenCalledWith("create_organisation",organisation);
  expect(upload).not.toHaveBeenCalled();
});

it("does not restore an old workspace from a new workspace slug collision",async()=>{
  const {rpc,upload}=signedIn({emailConfirmedAt:confirmedAt,request:approved,createError:{code:"23505"}});
  expect((await createOrganisation(undefined,organisationForm()))?.message).toContain("Withdraw this request");
  expect(rpc).not.toHaveBeenCalledWith("recover_created_organisation",expect.anything());
  expect(upload).not.toHaveBeenCalled();
});

it("does not create an extra workspace for an existing admin with no verification",async()=>{
  const {rpc,upload}=signedIn({organisationRoles:["organisation_admin"],onboardingMode:"complete",emailConfirmedAt:confirmedAt});
  expect((await createOrganisation(undefined,organisationForm()))?.message).toContain("must be approved");
  expect(rpc).not.toHaveBeenCalledWith("create_organisation",expect.anything());
  expect(upload).not.toHaveBeenCalled();
});

it("directs the owner to the already active workspace if adding the logo fails",async()=>{
  signedIn({emailConfirmedAt:confirmedAt,request:approved,uploadError:{message:"private provider error"}});
  const result=await createOrganisation(undefined,organisationForm());
  expect(result?.organisationId).toBe(orgId);
  expect(result?.message).toContain("Open the workspace");
  expect(result?.message).not.toContain("private provider error");
});

it("does not allow activation or recovery in audited preview",async()=>{
  vi.mocked(readAdminPreview).mockResolvedValueOnce({role:"engineer"} as never);
  const {rpc,upload}=signedIn({emailConfirmedAt:confirmedAt,request:approved});
  expect((await createOrganisation(undefined,organisationForm()))?.message).toContain("Exit read-only role preview");
  expect(rpc).not.toHaveBeenCalled();
  expect(upload).not.toHaveBeenCalled();
});
