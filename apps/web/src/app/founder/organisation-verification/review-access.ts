import {requireAuthenticatedUser} from "@/lib/auth";
import {requireFounderIdentity} from "@/lib/founder";

export const organisationVerificationPath="/founder/organisation-verification";

export async function getOrganisationVerificationReviewAccess(){
  const access=await requireFounderIdentity();
  // Some founders can view oversight without MFA. Verification decisions and
  // applicant details always require an actual MFA-elevated session.
  const session=access.authorised&&access.current_aal==="aal2"?await requireAuthenticatedUser():null;
  return {access,session};
}
