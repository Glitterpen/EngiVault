import { z } from "zod";

/** Only the minimal, scoped applicant or queue view is accepted from the verification RPCs. */
export const organisationVerificationSchema = z.object({
  id: z.uuid(),
  applicant_name: z.string(),
  organisation_name: z.string(),
  organisation_slug: z.string(),
  claimed_domain: z.string(),
  work_email: z.string(),
  status: z.enum(["pending", "approved", "rejected", "expired", "withdrawn", "activated"]),
  submitted_at: z.string(),
  decided_at: z.string().nullable(),
  expires_at: z.string().nullable(),
  workspace_id: z.uuid().nullable(),
});

export type OrganisationVerification = z.infer<typeof organisationVerificationSchema>;
