"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getOrganisationSetupAccess, organisationSetupPath } from "./setup-access";

export type OrganisationRequestState = { message: string } | undefined;

const requestDetails = z.object({
  applicant_name: z.string().trim().min(2).max(80),
  organisation_name: z.string().trim().min(2).max(100),
  organisation_slug: z.string().trim().toLowerCase().min(3).max(48).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  claimed_domain: z.string().trim().toLowerCase().max(253).regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}(?<!-)$/),
});

export async function submitOrganisationVerification(_: OrganisationRequestState, form: FormData): Promise<OrganisationRequestState> {
  const access = await getOrganisationSetupAccess();
  if (access.status === "email_required") return { message: "Verify your work email before submitting a request." };
  if (access.status === "unavailable") return { message: "We couldn’t verify your workspace access. Try again shortly." };
  if (access.status !== "ready" || !access.canRequest) return { message: "This account cannot request a new workspace." };

  const details = requestDetails.safeParse({
    applicant_name: form.get("applicant_name"),
    organisation_name: form.get("organisation_name"),
    organisation_slug: form.get("organisation_slug"),
    claimed_domain: form.get("claimed_domain"),
  });
  if (!details.success) return { message: "Check your name, organisation name, workspace address and domain. Enter the domain only, without a link or email address." };

  const { data, error } = await access.supabase.rpc("submit_organisation_verification", details.data);
  if (error || !data) {
    if (error?.code === "42501") return { message: "Use your verified, organisation-issued work email and an eligible account to request a workspace." };
    if (error?.code === "22023") return { message: "Use your organisation-issued work email and check the organisation details before trying again." };
    if (error?.code === "23505") return { message: "This workspace address is unavailable. Choose another address and try again." };
    if (error?.code === "55000") return { message: "You already have a verification request to complete. Refresh the page to check its status." };
    return { message: "We couldn’t submit your verification request. Check its status before retrying, or contact EngiCite support." };
  }
  revalidatePath(organisationSetupPath);
  redirect(organisationSetupPath);
}

export async function withdrawOrganisationVerification(_: OrganisationRequestState, form: FormData): Promise<OrganisationRequestState> {
  const access = await getOrganisationSetupAccess();
  if (access.status === "unavailable") return { message: "We couldn’t verify your workspace access. Try again shortly." };
  if (access.status !== "ready" || !access.canRequest) return { message: "This account cannot withdraw a verification request." };

  const requestId = z.uuid().safeParse(form.get("target_request"));
  if (!requestId.success) return { message: "This request could not be identified. Refresh the page and try again." };

  const { error } = await access.supabase.rpc("withdraw_organisation_verification", { target_request: requestId.data });
  if (error) return { message: "We couldn’t withdraw this request. Refresh the page to check its current status." };

  revalidatePath(organisationSetupPath);
  redirect(organisationSetupPath);
}
