// @vitest-environment node
import {renderToStaticMarkup} from "react-dom/server";
import {beforeEach,expect,it,vi} from "vitest";
import {createOrganisation} from "@/app/app/actions";
import {requireAuthenticatedUser} from "@/lib/auth";
import OrganisationSetupPage from "./page";

const mocks=vi.hoisted(()=>({redirect:vi.fn((path:string)=>{throw new Error(`redirect:${path}`);})}));
vi.mock("next/navigation",()=>({redirect:mocks.redirect}));
vi.mock("@/lib/auth",()=>({requireAuthenticatedUser:vi.fn()}));
vi.mock("@/lib/processor",()=>({buildProjectBackup:vi.fn()}));
vi.mock("@/lib/supabase/admin",()=>({createAdminClient:vi.fn()}));
vi.mock("@/lib/identity-purge",()=>({processQueuedIdentityPurges:vi.fn()}));
vi.mock("@/components/organisation-create-form",()=>({
  OrganisationCreateForm:({initialName,initialSlug}:{initialName:string;initialSlug:string})=>(
    <form aria-label="Create organisation">{initialName} {initialSlug}</form>
  ),
}));

const organisation={name:"Example Engineering",slug:"example-engineering"};
const orgId="82000000-0000-4000-8000-000000000001";
const confirmedAt="2026-11-01T10:00:00.000Z";

function organisationForm(){
  const form=new FormData();
  form.set("name",organisation.name);
  form.set("slug",organisation.slug);
  form.set("logo",new File([Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a])],"logo.png",{type:"image/png"}));
  return form;
}

function signedIn({email="worker@example.test",emailConfirmedAt,organisationRoles=[],projectRoles=[],onboardingMode="organisation",recover=false}:{
  email?:string; emailConfirmedAt?:string; organisationRoles?:string[]; projectRoles?:string[]; onboardingMode?:string; recover?:boolean;
}={}){
  const rpc=vi.fn(async(name:string)=>{
    switch(name){
      case "get_my_organisations":return {data:organisationRoles.map(role=>({role})),error:null};
      case "create_organisation":return recover?{data:null,error:{code:"23505"}}:{data:orgId,error:null};
      case "recover_created_organisation":return {data:orgId,error:null};
      case "update_organisation_identity":return {data:null,error:null};
      default:throw new Error(`Unexpected RPC: ${name}`);
    }
  });
  const upload=vi.fn().mockResolvedValue({error:null});
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

beforeEach(()=>vi.clearAllMocks());

it("shows verification guidance instead of the setup form until email is confirmed",async()=>{
  signedIn();
  const markup=renderToStaticMarkup(await OrganisationSetupPage());
  expect(markup).toContain("Verify your work email");
  expect(markup).toContain("/login?next=%2Forganisation%2Fsetup");
  expect(markup).not.toContain('aria-label="Create organisation"');
});

it("renders the organisation form with the existing prefill after email is confirmed",async()=>{
  signedIn({emailConfirmedAt:confirmedAt});
  const markup=renderToStaticMarkup(await OrganisationSetupPage());
  expect(markup).toContain('aria-label="Create organisation"');
  expect(markup).toContain(organisation.name);
  expect(markup).toContain(organisation.slug);
});

it("keeps established workspace members on their usual destination",async()=>{
  signedIn({organisationRoles:["organisation_admin"]});
  await expect(OrganisationSetupPage()).rejects.toThrow("redirect:/app");
});

it.each([{}, {email:"",emailConfirmedAt:confirmedAt}])("does not create a first workspace without a verified email identity: %o",async(account)=>{
  const {rpc,upload,updateUser}=signedIn(account);
  await expect(createOrganisation(undefined,organisationForm())).resolves.toEqual({message:"Verify your work email before creating the organisation workspace."});
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_organisations");
  expect(upload).not.toHaveBeenCalled();
  expect(updateUser).not.toHaveBeenCalled();
});

it("preserves verified first-owner creation and logo setup",async()=>{
  const {rpc,upload,updateUser}=signedIn({emailConfirmedAt:confirmedAt});
  await expect(createOrganisation(undefined,organisationForm())).rejects.toThrow(`redirect:/app/${orgId}`);
  expect(rpc).toHaveBeenCalledWith("create_organisation",organisation);
  expect(upload).toHaveBeenCalledTimes(1);
  expect(updateUser).toHaveBeenCalledWith({data:expect.objectContaining({onboarding_mode:null})});
});

it("preserves verified owner recovery if organisation creation already occurred",async()=>{
  const {rpc,upload}=signedIn({emailConfirmedAt:confirmedAt,recover:true});
  await expect(createOrganisation(undefined,organisationForm())).rejects.toThrow(`redirect:/app/${orgId}`);
  expect(rpc).toHaveBeenCalledWith("recover_created_organisation",{organisation_slug:organisation.slug});
  expect(upload).toHaveBeenCalledTimes(1);
});

it("leaves additional-workspace creation for existing organisation admins unchanged",async()=>{
  const {rpc,updateUser}=signedIn({organisationRoles:["organisation_admin"],onboardingMode:"complete"});
  await expect(createOrganisation(undefined,organisationForm())).rejects.toThrow(`redirect:/app/${orgId}`);
  expect(rpc).toHaveBeenCalledWith("create_organisation",organisation);
  expect(updateUser).not.toHaveBeenCalled();
});

it("does not grant project members organisation creation even with confirmed work email",async()=>{
  const {rpc}=signedIn({emailConfirmedAt:confirmedAt,projectRoles:["document_controller"]});
  expect((await createOrganisation(undefined,organisationForm()))?.message).toContain("Project members cannot create organisations.");
  expect(rpc).not.toHaveBeenCalledWith("create_organisation",expect.anything());
});
