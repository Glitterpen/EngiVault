"use server";

import {revalidatePath} from "next/cache";
import {z} from "zod";
import {getOrganisationVerificationReviewAccess,organisationVerificationPath} from "./review-access";

export type OrganisationVerificationReviewState={kind:"error"|"success";message:string}|undefined;

const requestSchema=z.object({requestId:z.uuid(),decision:z.enum(["approve","reject"])});
const evidenceSchema=z.object({
  name:z.string().trim().min(2).max(100),
  role:z.string().trim().min(2).max(100),
  method:z.enum(["company_email","company_phone"]),
  reference:z.string().trim().min(4).max(300),
  domain:z.string().trim().toLowerCase().max(253)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/),
});

function singleValue(form:FormData,name:string){
  const entries=form.getAll(name);
  return entries.length===1&&typeof entries[0]==="string"?entries[0]:null;
}

export async function reviewOrganisationVerification(
  _state:OrganisationVerificationReviewState,
  form:FormData,
):Promise<OrganisationVerificationReviewState>{
  const {session}=await getOrganisationVerificationReviewAccess();
  if(!session)return {kind:"error",message:"Verify your authenticator session before reviewing organisation requests."};

  const request=requestSchema.safeParse({requestId:singleValue(form,"requestId"),decision:singleValue(form,"decision")});
  if(!request.success)return {kind:"error",message:"The review request is invalid. Refresh the queue and try again."};
  const {decision,requestId}=request.data;
  let evidence:z.infer<typeof evidenceSchema>|null=null;
  if(decision==="approve"){
    const checked=["independentRepresentative","affiliationConfirmed","authorityConfirmed"].every(name=>singleValue(form,name)==="confirmed");
    if(!checked)return {kind:"error",message:"Confirm the representative is independent and has confirmed both employment and authority."};
    const result=evidenceSchema.safeParse({
      name:singleValue(form,"representativeName"),role:singleValue(form,"representativeRole"),
      method:singleValue(form,"confirmationMethod"),reference:singleValue(form,"confirmationReference"),
      domain:singleValue(form,"verifiedWorkDomain"),
    });
    if(!result.success)return {kind:"error",message:"Enter the representative, confirmation source and verified work domain before recording approval."};
    evidence=result.data;
  }

  try{
    const {error}=await session.supabase.rpc("review_organisation_verification",{
      target_request:requestId,
      decision,
      representative_name:evidence?.name??null,
      representative_role:evidence?.role??null,
      confirmation_method:evidence?.method??null,
      confirmation_reference:evidence?.reference??null,
      verified_work_domain:evidence?.domain??null,
      affiliation_confirmed:decision==="approve",
      authority_confirmed:decision==="approve",
    });
    if(error?.code==="42501")return {kind:"error",message:"You cannot review this request with your current access."};
    if(error?.code==="P0002")return {kind:"error",message:"This request is no longer available for review. Refresh the queue."};
    if(error?.code==="22023")return {kind:"error",message:"Check that the representative is not the applicant and that the verified domain matches the applicant’s work email."};
    if(error)return {kind:"error",message:"The decision could not be recorded. Refresh the queue before trying again."};
  }catch{
    return {kind:"error",message:"The decision could not be confirmed. Refresh the queue before trying again."};
  }

  revalidatePath(organisationVerificationPath);
  return {kind:"success",message:decision==="approve"?"Approval recorded. The applicant can now complete workspace setup.":"Request declined. No workspace was created."};
}
