type RegistrationPolicySection = {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly bullets?: readonly string[];
  readonly commitments?: readonly { readonly title: string; readonly description: string }[];
};

// Draft for organisational and legal approval before production publication.
// Changes to this text must be accompanied by a new registration-policy version.
export const REGISTRATION_POLICY_INTRO = "Your organisation manages access to its project records. EngiOne LTD provides and protects the workspace. This notice explains how we look after information and where you can get help.";

export const REGISTRATION_POLICY_SECTIONS: readonly RegistrationPolicySection[] = [
  {
    id: "scope",
    title: "Who this policy applies to",
    paragraphs: [
      "This notice is for anyone setting up or joining an EngiCite workspace. EngiCite is an engineering document control and project delivery service from EngiOne LTD.",
      "Your organisation generally decides what project information to use and who may access it. Where we handle records on your organisation’s behalf, we follow its authorised instructions. We also use account and service information to operate, support and protect EngiCite. The applicable law and your organisation’s agreement with us help define those responsibilities.",
    ],
  },
  {
    id: "engione-responsibilities",
    title: "EngiOne LTD’s responsibilities",
    paragraphs: [
      "We take responsibility for how EngiCite is operated and for the information you entrust to us. Here is what you can expect from EngiOne LTD:",
    ],
    commitments: [
      { title: "Use information for clear purposes", description: "We use account and service information for the purposes described here. We handle your organisation’s project information on its authorised instructions to provide, support and protect the service, unless the law requires otherwise." },
      { title: "Keep access limited and confidential", description: "We use safeguards suited to the information we handle, including private storage and project access controls. Our staff and service providers may access information only as needed for authorised work. We require them to keep it confidential and secure." },
      { title: "Act promptly when a concern arises", description: "We investigate security concerns and take steps to contain incidents and reduce their impact. If we become aware of a personal data breach affecting records we process on your organisation’s behalf, we tell your organisation promptly and help it respond. We notify affected people or regulators when required by law." },
      { title: "Help you with privacy and records requests", description: "We respond to verified requests about account and service information we manage and help your organisation respond to requests about its project records. We also help authorised administrators with available export, retention and deletion options, subject to legal and contractual record-keeping requirements." },
      { title: "Keep you informed about changes", description: "We make the current notice available and communicate significant changes as required by law or our agreement with your organisation." },
    ],
  },
  {
    id: "security",
    title: "How we protect your workspace",
    paragraphs: [
      "EngiCite uses private file storage and organisation and project permissions to control who can see records. Download links expire where applicable, and activity records help authorised teams trace key actions.",
      "New and replacement engineering uploads are screened before release. Files being checked are held out of normal use. Screening helps identify potential threats; Document Control and engineering approvals remain separate. Once a copy is exported, it is handled under your organisation’s procedures and is no longer controlled by workspace permissions.",
    ],
  },
  {
    id: "authority",
    title: "Setting up or joining a workspace",
    paragraphs: [
      "If you are setting up a workspace, use your own work email and your organisation’s correct name. Confirm that you work for the organisation and have its approval to set up and administer the workspace on its behalf.",
      "If you are joining a workspace, register with the work email on your active invitation. We check that the invitation matches that address to help keep access with the intended person. Keep the invitation link for your own use.",
      "Email verification confirms you can access your mailbox. Your declaration is how you tell us you are authorised; it is not a separate verification of employment or delegated authority.",
    ],
  },
  {
    id: "information",
    title: "What information we use and why",
    paragraphs: [
      "What we use depends on your role and the features you use. Some details come from you, some come from your organisation’s invitations and appointments, and others are created as you work.",
    ],
    bullets: [
      "Account details such as your name, work email, organisation, roles, invitation status and declarations help you register, verify and recover your account and help your administrator manage access.",
      "Project records such as files, revisions, assignments, comments, approvals, transmittals and recipient details help teams coordinate work and find, track and issue documents.",
      "Session, verification, activity and audit records help us protect the service, investigate concerns and fix problems. When relevant, we use billing details and service communications to manage your organisation’s account.",
    ],
  },
  {
    id: "responsibilities",
    title: "How your organisation and team help protect information",
    paragraphs: [
      "Using EngiCite does not change who owns project records. Your organisation manages access, confirms it has permission to use and share its records, provides any required notices, and lets us know about requirements that affect how we handle its information.",
    ],
    bullets: [
      "Use your own account, keep passwords, verification codes and invitation links private, and use additional verification where required or available.",
      "Work within your role. Before issuing files, check the project, revision and recipient. Include only the personal information needed for the work and follow your organisation’s approval and handling rules for restricted information.",
      "If you manage a workspace, review appointments and update access promptly when roles change. If you notice something unexpected, tell your administrator or use your workspace support channel.",
    ],
  },
  {
    id: "sharing",
    title: "Sharing, service providers and assisted features",
    paragraphs: [
      "Workspace roles determine who can see project information. When a team issues documents, the selected recipients can receive them according to the project’s delivery settings. Our service providers help us run functions such as hosting, communications, fraud prevention, payment administration and document processing. We may also disclose information when required by law or in response to a valid legal request.",
      "When assisted search or answers are enabled, a service provider may process relevant text and references from authorised documents to make them searchable. It may also process questions you submit and related document excerpts to generate answers. Use the referenced documents to confirm results. Engineering judgement and formal approval remain with your project team.",
    ],
  },
  {
    id: "transfers-retention",
    title: "Data location, retention, export and removal",
    paragraphs: [
      "Hosting, service operation or support may involve handling information in another country. Where applicable, we follow transfer requirements and agreed location restrictions. If your project has specific data location requirements, check the arrangements before uploading restricted information.",
      "We keep information according to its purpose, the law, our agreement with your organisation and security needs. Ending someone’s access does not automatically delete project records: revision, approval and delivery history, audit records or backups may need to be kept separately. Authorised administrators can ask about export or removal. This does not remove copies already shared or downloaded.",
    ],
  },
  {
    id: "data-rights",
    title: "Your privacy rights and how to raise a concern",
    paragraphs: [
      "You can ask how your personal information is used and request help with your privacy rights. Depending on the law, those rights may include access, correction, deletion, restriction, a portable copy, objection or withdrawal of consent where consent is the basis. We may verify your identity to protect your information.",
      "For project records your organisation manages, contact its privacy or workspace administrator. For EngiCite account or service information, use the support contact provided for your workspace. You may also be able to raise a complaint with the appropriate regulator, such as the Nigeria Data Protection Commission where applicable.",
      "Acknowledging this notice confirms you have read it. It does not waive your privacy rights or give general permission for unrelated uses of your information.",
    ],
  },
  {
    id: "incidents",
    title: "Getting help and staying informed",
    paragraphs: [
      "If something does not look right with access, your account or a document delivery, let your administrator and workspace support know promptly. A project name, time and short description help us look into it. Keep passwords and access links private and leave out files you do not need to share.",
      "If your role changes, let your administrator know so they can update your access. The registration form shows which version of this notice you are reading. If the notice changes significantly, a later registration may ask you to review the updated version.",
    ],
  },
];
