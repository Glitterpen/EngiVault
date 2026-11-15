import "server-only";
import { readAdminPreview } from "@/lib/admin-preview";
import { requireAuthenticatedUser } from "@/lib/auth";
import { canCreateOrganisationWorkspace } from "@/lib/role-experience";

export const organisationSetupPath = "/organisation/setup";
export const organisationSetupLoginPath = "/login?next=%2Forganisation%2Fsetup";

/** Screen and submission checks complement the database's authoritative gate. */
export async function getOrganisationSetupAccess() {
  const { supabase, user } = await requireAuthenticatedUser(organisationSetupLoginPath);
  if (await readAdminPreview()) return { status: "preview" } as const;

  const { data, error } = await supabase.rpc("get_my_organisations");
  if (error || !Array.isArray(data)) return { status: "unavailable" } as const;
  const organisationRoles = data.map((record: { role: string }) => record.role);
  const hasWorkspace = organisationRoles.length > 0;
  if (hasWorkspace && !organisationRoles.includes("organisation_admin")) {
    return { status: "denied", hasWorkspace } as const;
  }

  const onboarding = user.user_metadata?.onboarding_mode === "organisation";
  const recoverable = await supabase.rpc("has_recoverable_created_organisation");
  const canRestore = !recoverable.error && recoverable.data === true;
  // If eligibility depends on this RPC, do not convert a verification outage
  // into a denial or silently present a restoration form.
  if (!hasWorkspace && !onboarding && recoverable.error) return { status: "unavailable" } as const;

  let projectRoles: string[] = [];
  if (!hasWorkspace && (onboarding || canRestore)) {
    const projectAccess = await supabase.from("project_access").select("role").limit(1);
    if (projectAccess.error || !Array.isArray(projectAccess.data)) return { status: "unavailable" } as const;
    projectRoles = projectAccess.data.map((record) => String(record.role));
  }
  const canRequest = canCreateOrganisationWorkspace(organisationRoles, projectRoles, onboarding);
  if (!canRequest && !(canRestore && !projectRoles.length)) {
    return { status: "denied", hasWorkspace: hasWorkspace || projectRoles.length > 0 } as const;
  }
  if (!user.email || !user.email_confirmed_at) return { status: "email_required", hasWorkspace } as const;

  return {
    status: "ready", supabase, user, email: user.email.trim().toLowerCase(), hasWorkspace,
    canRequest, canRestore: canRestore && (hasWorkspace || !projectRoles.length),
  } as const;
}
