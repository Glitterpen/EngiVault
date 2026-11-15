// Increment the policy or declaration version when its meaning changes.
export const ACCOUNT_USE_ACKNOWLEDGEMENT_FIELD = "accountUseAcknowledgement";
const registrationPolicyEdition = 4;
export const ACCOUNT_USE_ACKNOWLEDGEMENT_VERSION = `registration-policy-v${registrationPolicyEdition}`;
export const REGISTRATION_POLICY_DISPLAY_VERSION = `Version ${registrationPolicyEdition}`;
export const REGISTRATION_POLICY_LABEL = "I have read and understood the Policy, Security and Data Protection notice.";
export const REGISTRATION_DECLARATION_FIELD = "registrationDeclaration";

export const REGISTRATION_DECLARATIONS = {
  organisation: {
    value: "organisation-authority-v2",
    title: "Organisation Data Protection and Authority Declaration",
    statements: [
      "I am a member of staff at the organisation named here, and I am using my own work email.",
      "My organisation has authorised me to set up this workspace, serve as its first Organisation Administrator and accept the account-use responsibilities on its behalf.",
      "I will add users and handle project information within the authority my organisation gives me, and obtain any required organisation or client approval before uploading or sharing protected information.",
      "I will tell my organisation and EngiCite promptly if my authority changes or if I learn the registration was not authorised.",
    ],
    label: "I confirm that I am an authorised member of staff and that these declarations are true.",
  },
  invitation: {
    value: "named-invitee-v2",
    title: "Invitation and Authorised Access Declaration",
    statements: [
      "This invitation was sent to me at the work email I entered, and I am using my own mailbox.",
      "I am authorised to join the workspace or project named in the invitation and will use only the access the organisation gives me.",
      "I will keep my invitation for my own use. If it reached me by mistake or my authority ends, I will let the inviting organisation know and stop using the access.",
    ],
    label: "I confirm that I am the intended invitee and agree to use only the access granted to me.",
  },
} as const;

export type RegistrationAudience = keyof typeof REGISTRATION_DECLARATIONS;

function containsExactlyOne(formData: FormData, field: string, expected: string): boolean {
  const values = formData.getAll(field);
  return values.length === 1 && values[0] === expected;
}

export function hasCurrentAccountUseAcknowledgement(formData: FormData): boolean {
  return containsExactlyOne(formData, ACCOUNT_USE_ACKNOWLEDGEMENT_FIELD, ACCOUNT_USE_ACKNOWLEDGEMENT_VERSION);
}

export function hasRegistrationDeclaration(formData: FormData, audience: RegistrationAudience): boolean {
  return containsExactlyOne(formData, REGISTRATION_DECLARATION_FIELD, REGISTRATION_DECLARATIONS[audience].value);
}
