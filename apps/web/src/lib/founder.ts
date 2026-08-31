import "server-only";
import {notFound, redirect} from "next/navigation";
import {z} from "zod";
import {requireAuthenticatedUser} from "@/lib/auth";

const accessSchema=z.object({
  is_founder:z.boolean(),
  access_status:z.string(),
  require_mfa:z.boolean(),
  current_aal:z.string(),
  authorised:z.boolean(),
});

const organisationSchema=z.object({
  id:z.string().uuid(),name:z.string(),slug:z.string(),status:z.string(),created_at:z.string(),
  owner_name:z.string().nullable(),owner_email:z.string().nullable(),plan_code:z.string(),plan_name:z.string(),
  subscription_status:z.string(),provider_name:z.string().nullable(),licence_started_at:z.string().nullable(),
  licence_ends_at:z.string().nullable(),cancel_at_period_end:z.boolean().nullable(),licence_duration_days:z.number().int().nullable(),
  licence_days_remaining:z.number().int().nullable(),active_users:z.number().int(),total_users:z.number().int(),
  active_projects:z.number().int(),archived_projects:z.number().int(),total_documents:z.number().int(),
  overdue_documents:z.number().int(),failed_revisions:z.number().int(),pending_invitations:z.number().int(),
  last_sign_in_at:z.string().nullable(),last_activity_at:z.string().nullable(),is_new:z.boolean(),
  licence_is_current:z.boolean(),health_score:z.number().int(),warnings:z.array(z.string()),
  health_state:z.enum(["healthy","attention","critical"]),
});

const userOrganisationSchema=z.object({
  organisation_id:z.string().uuid(),organisation_name:z.string(),role:z.string(),status:z.string(),
});

const userSchema=z.object({
  id:z.string().uuid(),email:z.string().nullable(),display_name:z.string(),created_at:z.string(),
  email_confirmed_at:z.string().nullable(),last_sign_in_at:z.string().nullable(),banned_until:z.string().nullable(),
  organisations:z.array(userOrganisationSchema),project_roles:z.array(z.string()),active_organisation_memberships:z.number().int(),
  account_state:z.enum(["active","inactive","invited","pending_verification","orphaned","suspended"]),
});

const dashboardSchema=z.object({
  authorised:z.literal(true),generated_at:z.string(),
  summary:z.object({
    organisations:z.number().int(),new_organisations:z.number().int(),active_licences:z.number().int(),
    users:z.number().int(),needs_attention:z.number().int(),orphaned_users:z.number().int(),
  }),
  organisations:z.array(organisationSchema),users:z.array(userSchema),
  filters:z.object({search:z.string().nullable(),health:z.string(),limit:z.number().int(),offset:z.number().int()}),
});

export type FounderAccess=z.infer<typeof accessSchema>;
export type FounderDashboard=z.infer<typeof dashboardSchema>;
export type FounderOrganisation=FounderDashboard["organisations"][number];
export type FounderUser=FounderDashboard["users"][number];

export async function getFounderAccessStatus():Promise<FounderAccess>{
  const {supabase}=await requireAuthenticatedUser();
  const {data,error}=await supabase.rpc("get_founder_access_status");
  if(error)throw new Error(`Founder access verification failed: ${error.code}`);
  return accessSchema.parse(data);
}

export async function requireFounderIdentity():Promise<FounderAccess>{
  const access=await getFounderAccessStatus();
  if(!access.is_founder||access.access_status!=="active")notFound();
  return access;
}

export async function getFounderDashboard(filters:{search?:string;health?:string}):Promise<FounderDashboard>{
  const access=await requireFounderIdentity();
  if(!access.authorised)redirect("/founder/security");
  const {supabase}=await requireAuthenticatedUser();
  const {data,error}=await supabase.rpc("get_founder_dashboard",{
    search_query:filters.search?.trim()||null,
    health_filter:filters.health??"all",
    result_limit:100,
    result_offset:0,
  });
  if(error)throw new Error(`Founder dashboard failed: ${error.code}`);
  const result=z.union([dashboardSchema,z.object({authorised:z.literal(false),error:z.string().optional()})]).parse(data);
  if(!result.authorised){
    if(result.error)throw new Error("Founder dashboard is temporarily unavailable.");
    redirect("/founder/security");
  }
  return result;
}
