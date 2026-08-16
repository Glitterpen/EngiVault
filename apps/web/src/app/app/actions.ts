"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser, requireProject } from "@/lib/auth";
import { DOCUMENT_ISSUE_STATUS_VALUES, isDocumentIssueStatus } from "@/lib/document-issue-status";
import { organisationLogoValidation,projectLogoValidation } from "@/lib/file-validation";
import { canCreateOrganisationWorkspace } from "@/lib/role-experience";

const slug=z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).min(3).max(48);
const issueStatus=z.enum(DOCUMENT_ISSUE_STATUS_VALUES);
const optionalIssueStatus=z.union([issueStatus,z.literal("")]);
export type MutationState={message?:string;mutationId?:string;logoVersion?:string;projectId?:string}|undefined;
export async function createOrganisation(_:MutationState,form:FormData):Promise<MutationState>{
 const parsed=z.object({name:z.string().trim().min(2).max(100),slug}).safeParse(Object.fromEntries(form));
 const logo=form.get("logo");
 if(!parsed.success)return {message:"Enter a valid organisation name and lowercase URL slug."};
 if(!(logo instanceof File))return {message:"Choose your company logo."};
 const logoError=organisationLogoValidation(logo.size,logo.type,new Uint8Array(await logo.slice(0,16).arrayBuffer()));
 if(logoError)return {message:logoError};
 const {supabase}=await requireUser();
 const {data:memberships,error:membershipError}=await supabase.rpc("get_my_organisations");
 if(membershipError)return {message:"Organisation creation permission could not be verified."};
 const organisationRoles=(memberships??[]).map((membership:{role:string})=>String(membership.role));
 const projectRoles:string[]=[];
 if(!organisationRoles.length){
  const {data:projectAccess,error:projectAccessError}=await supabase.from("project_access").select("role").limit(1);
  if(projectAccessError)return {message:"Organisation creation permission could not be verified."};
  projectRoles.push(...(projectAccess??[]).map((item:{role:string})=>String(item.role)));
 }
 if(!canCreateOrganisationWorkspace(organisationRoles,projectRoles))return {message:"Document Controllers and other project members cannot create organisations. Only an Organisation Administrator can do this."};
 let organisationId:string;
 const {data,error}=await supabase.rpc("create_organisation",parsed.data);
 if(error?.code==="23505"){
  const {data:recovered,error:recoveryError}=await supabase.rpc("recover_created_organisation",{organisation_slug:parsed.data.slug});
  if(recoveryError||!recovered)return {message:"This organisation slug already exists and could not be reclaimed by the signed-in account."};
  organisationId=String(recovered);
 }else if(error)return {message:`Organisation could not be created: ${error.message} Reference: ${error.code}.`};
 else organisationId=String(data);
 const logoPath=`${organisationId}/branding/company-logo`;
 const {error:uploadError}=await supabase.storage.from("organisation-assets").upload(logoPath,await logo.arrayBuffer(),{contentType:logo.type,upsert:true,cacheControl:"3600"});
 if(uploadError)return {message:`Organisation was created, but its logo could not be stored. Submit the same details again after applying the organisation-branding migration. Reference: ${uploadError.message}.`};
 const {error:updateError}=await supabase.rpc("update_organisation_identity",{target_organisation:organisationId,new_name:parsed.data.name,new_slug:parsed.data.slug,new_logo_path:logoPath,new_logo_mime:logo.type});
 if(updateError)return {message:updateError.code==="PGRST202"?"Organisation was created and its logo was stored. Apply the organisation-management database update, then submit the same details again to finish linking the logo.":`Organisation was created and its logo was stored, but the logo could not be linked. Submit the same details again. Reference: ${updateError.code}.`};
 redirect(`/app/${organisationId}`)
}
export async function createProject(_:MutationState,form:FormData):Promise<MutationState>{
 const optionalText=z.preprocess(value=>typeof value==="string"&&value.trim()===""?null:value,z.string().trim().max(180).nullable());
 const parsed=z.object({organisationId:z.uuid(),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/),name:z.string().trim().min(2).max(120),clientName:z.string().trim().min(2).max(160),facility:optionalText}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {message:"Enter a valid project code, project name and client name."};
 const logos=form.getAll("clientLogos").filter((value):value is File=>value instanceof File&&value.size>0);
 if(logos.length>3)return {message:"Select no more than three client logos."};
 for(const logo of logos){
  const logoError=projectLogoValidation(logo.size,logo.type,new Uint8Array(await logo.slice(0,16).arrayBuffer()));
  if(logoError)return {message:logoError};
 }
 const {supabase}=await requireUser();
 const {data:memberships}=await supabase.rpc("get_my_organisations");
 const isAdministrator=(memberships??[]).some((item:{organisation_id:string;role:string})=>item.organisation_id===parsed.data.organisationId&&item.role==="organisation_admin");
 if(!isAdministrator)return {message:"Only an Organisation Administrator can create a project."};
 const projectId=crypto.randomUUID();
 const logoPaths=logos.map((_,index)=>`${parsed.data.organisationId}/${projectId}/branding/client-logo-${index+1}`);
 const uploadedPaths:string[]=[];
 for(let index=0;index<logos.length;index+=1){
  const logo=logos[index];const path=logoPaths[index];
  const {error:uploadError}=await supabase.storage.from("project-assets").upload(path,await logo.arrayBuffer(),{contentType:logo.type,upsert:false,cacheControl:"3600"});
  if(uploadError){
   if(uploadedPaths.length)await supabase.storage.from("project-assets").remove(uploadedPaths);
   return {message:uploadError.message.toLowerCase().includes("bucket")?"Apply the project-branding database update before adding client logos.":`A client logo could not be stored. Reference: ${uploadError.message}.`};
  }
  uploadedPaths.push(path);
 }
 const {error}=await supabase.from("projects").insert({id:projectId,organisation_id:parsed.data.organisationId,code:parsed.data.code,name:parsed.data.name,client_name:parsed.data.clientName,facility_location:parsed.data.facility,client_logo_paths:logoPaths});
 if(error){
  if(uploadedPaths.length)await supabase.storage.from("project-assets").remove(uploadedPaths);
  if(error.code==="23505")return {message:"That project code already exists in this organisation."};
  if(error.code==="PGRST204"||error.code==="42703")return {message:"Apply the project-branding database update before creating this project."};
  return {message:`Project could not be created: ${error.message} Reference: ${error.code}.`};
 }
 revalidatePath(`/app/${parsed.data.organisationId}`);
 return {message:"Project created successfully with its client identity.",mutationId:crypto.randomUUID(),projectId};
}
export async function createDocument(_:MutationState,form:FormData):Promise<MutationState>{const optional=z.preprocess(v=>typeof v==="string"&&v.trim()===""?null:v,z.string().trim().max(80).nullable());const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),documentNumber:z.string().trim().toUpperCase().min(2).max(80),title:z.string().trim().min(2).max(240),documentType:z.string().trim().min(2).max(80),discipline:z.string().trim().min(2).max(80),plannedSubmissionDate:z.iso.date(),area:optional,system:optional,workPackage:optional}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Enter valid document metadata and the agreed submission date."};const {supabase}=await requireProject(parsed.data.organisationId,parsed.data.projectId);const {data,error}=await supabase.rpc("create_mdr_document",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,new_document_number:parsed.data.documentNumber,new_title:parsed.data.title,new_document_type:parsed.data.documentType,new_discipline:parsed.data.discipline,new_planned_submission_date:parsed.data.plannedSubmissionDate,new_area:parsed.data.area??"",new_system:parsed.data.system??"",new_work_package:parsed.data.workPackage??""});if(error)return {message:error.code==="23505"?"That document number already exists in this project.":error.code==="42501"?"Only the appointed Document Controller can create Master Document Register entries.":`Document could not be created. Reference: ${error.code}.`};redirect(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/documents/${data}`)}

export async function createDocumentCategory(_:MutationState,form:FormData):Promise<MutationState>{const parsed=z.object({organisationId:z.uuid(),kind:z.enum(["discipline","document_type"]),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,24}$/),name:z.string().trim().min(2).max(80)}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Enter a category name and a short code using letters, numbers or hyphens."};const {supabase}=await requireUser();const {error}=await supabase.from("document_categories").insert({organisation_id:parsed.data.organisationId,kind:parsed.data.kind,code:parsed.data.code,name:parsed.data.name});if(error)return {message:error.code==="23505"?"That category code already exists.":`Category could not be created. Reference: ${error.code}.`};revalidatePath(`/app/${parsed.data.organisationId}/settings/document-categories`);return {message:"Category added."}}

export async function toggleDocumentCategory(form:FormData){const parsed=z.object({organisationId:z.uuid(),categoryId:z.uuid(),isActive:z.enum(["true","false"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return;const {supabase}=await requireUser();await supabase.from("document_categories").update({is_active:parsed.data.isActive==="true"}).eq("organisation_id",parsed.data.organisationId).eq("id",parsed.data.categoryId);revalidatePath(`/app/${parsed.data.organisationId}/settings/document-categories`)}

export async function updateOrganisation(_:MutationState,form:FormData):Promise<MutationState>{
 const parsed=z.object({organisationId:z.uuid(),name:z.string().trim().min(2).max(100),slug}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {message:"Enter a valid organisation name and lowercase URL slug."};
 const logo=form.get("logo");
 const replacementLogo=logo instanceof File&&logo.size>0?logo:null;
 if(replacementLogo){const logoError=organisationLogoValidation(replacementLogo.size,replacementLogo.type,new Uint8Array(await replacementLogo.slice(0,16).arrayBuffer()));if(logoError)return {message:logoError}}
 const {supabase}=await requireUser();
 const {data:memberships}=await supabase.rpc("get_my_organisations");
 const membership=(memberships??[]).find((item:{organisation_id:string;role:string})=>item.organisation_id===parsed.data.organisationId&&item.role==="organisation_admin");
 if(!membership)return {message:"Only an Organisation Administrator can edit this organisation."};
 let logoPath:string|null=null;
 let logoMime:string|null=null;
 if(replacementLogo){
  logoPath=`${parsed.data.organisationId}/branding/company-logo`;
  logoMime=replacementLogo.type;
  const {error:uploadError}=await supabase.storage.from("organisation-assets").upload(logoPath,await replacementLogo.arrayBuffer(),{contentType:replacementLogo.type,upsert:true,cacheControl:"60"});
  if(uploadError)return {message:`The replacement logo could not be stored. Reference: ${uploadError.message}.`};
 }
 const {error}=await supabase.rpc("update_organisation_identity",{target_organisation:parsed.data.organisationId,new_name:parsed.data.name,new_slug:parsed.data.slug,new_logo_path:logoPath,new_logo_mime:logoMime});
 if(error)return {message:error.code==="23505"?"That URL slug is already used by another organisation.":error.code==="PGRST202"?"Apply the organisation-management database update before editing.":`Organisation could not be updated. Reference: ${error.code}.`};
 const mutationId=crypto.randomUUID();
 revalidatePath("/app");revalidatePath(`/app/${parsed.data.organisationId}`);revalidatePath(`/app/${parsed.data.organisationId}/settings`);
 return {message:"Organisation details updated.",mutationId,logoVersion:replacementLogo?mutationId:undefined}
}
export async function setOrganisationArchived(form:FormData){const parsed=z.object({organisationId:z.uuid(),archived:z.enum(["true","false"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return;const {supabase}=await requireUser();await supabase.rpc("set_organisation_archived",{target_organisation:parsed.data.organisationId,archived:parsed.data.archived==="true"});redirect("/app")}
export async function deleteOrganisation(_:MutationState,form:FormData):Promise<MutationState>{
 const parsed=z.object({organisationId:z.uuid(),confirmationName:z.string().trim().min(2).max(100),acknowledge:z.literal("yes")}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {message:"Type the exact organisation name and confirm that you understand the effect."};
 const {supabase}=await requireUser();
 const {error}=await supabase.rpc("soft_delete_organisation",{target_organisation:parsed.data.organisationId,confirmation_name:parsed.data.confirmationName});
 if(error)return {message:error.code==="PGRST202"?"Apply the organisation-management database update before deleting.":error.message.includes("confirmation")?"The organisation name does not match.":error.message.includes("forbidden")?"Only an Organisation Administrator can delete this organisation.":`Organisation could not be deleted. Reference: ${error.code}.`};
 revalidatePath("/app");redirect("/app")
}
export async function updateProject(_:MutationState,form:FormData):Promise<MutationState>{
 const optionalText=z.string().trim().max(180);
 const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),code:z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9-]{1,19}$/),name:z.string().trim().min(2).max(120),description:z.string().trim().max(1000),clientName:z.string().trim().min(2).max(160),facility:optionalText}).safeParse(Object.fromEntries(form));
 if(!parsed.success)return {message:"Enter valid project and client details."};
 const logos=form.getAll("clientLogos").filter((value):value is File=>value instanceof File&&value.size>0);
 if(logos.length>3)return {message:"Select no more than three client logos."};
 for(const logo of logos){const logoError=projectLogoValidation(logo.size,logo.type,new Uint8Array(await logo.slice(0,16).arrayBuffer()));if(logoError)return {message:logoError}}
 const {supabase}=await requireProject(parsed.data.organisationId,parsed.data.projectId);
 const {data:existing}=await supabase.from("projects").select("client_logo_paths").eq("organisation_id",parsed.data.organisationId).eq("id",parsed.data.projectId).maybeSingle();
 const oldPaths=Array.isArray(existing?.client_logo_paths)?existing.client_logo_paths.filter((value):value is string=>typeof value==="string"):[];
 const logoPaths=logos.map((_,index)=>`${parsed.data.organisationId}/${parsed.data.projectId}/branding/client-logo-${index+1}`);
 for(let index=0;index<logos.length;index+=1){
  const logo=logos[index];const path=logoPaths[index];
  const {error:uploadError}=await supabase.storage.from("project-assets").upload(path,await logo.arrayBuffer(),{contentType:logo.type,upsert:true,cacheControl:"60"});
  if(uploadError)return {message:`A replacement client logo could not be stored. Reference: ${uploadError.message}.`};
 }
 const {error}=await supabase.rpc("update_project_identity",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,new_code:parsed.data.code,new_name:parsed.data.name,new_description:parsed.data.description,new_client_name:parsed.data.clientName,new_facility_location:parsed.data.facility,new_client_logo_paths:logos.length?logoPaths:null});
 if(error)return {message:error.code==="PGRST202"?"Apply the project identity management database update before editing.":`Project could not be updated. Reference: ${error.code}.`};
 if(logos.length){const stalePaths=oldPaths.filter(path=>!logoPaths.includes(path));if(stalePaths.length)await supabase.storage.from("project-assets").remove(stalePaths)}
 const mutationId=crypto.randomUUID();
 revalidatePath(`/app/${parsed.data.organisationId}`);revalidatePath("/app/projects");revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/overview`);revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/settings`);
 return {message:"Project and client identity updated.",mutationId,logoVersion:logos.length?mutationId:undefined}
}
export async function setProjectArchived(form:FormData){const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),archived:z.enum(["true","false"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return;const {supabase}=await requireUser();await supabase.rpc("set_project_archived",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,archived:parsed.data.archived==="true"});redirect(`/app/${parsed.data.organisationId}`)}
export async function updateDocument(_:MutationState,form:FormData):Promise<MutationState>{const optional=z.string().trim().max(80);const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),documentId:z.uuid(),documentNumber:z.string().trim().toUpperCase().min(2).max(80),title:z.string().trim().min(2).max(240),documentType:z.string().trim().min(2).max(80),discipline:z.string().trim().min(2).max(80),area:optional,system:optional,workPackage:optional}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Enter valid document metadata."};const {supabase}=await requireProject(parsed.data.organisationId,parsed.data.projectId);const {error}=await supabase.rpc("update_document",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_document:parsed.data.documentId,new_number:parsed.data.documentNumber,new_title:parsed.data.title,new_type:parsed.data.documentType,new_discipline:parsed.data.discipline,new_area:parsed.data.area,new_system:parsed.data.system,new_work_package:parsed.data.workPackage});if(error)return {message:`Document could not be updated. Reference: ${error.code}.`};revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/documents/${parsed.data.documentId}`);return {message:"Document metadata updated."}}
export async function setDocumentArchived(form:FormData){const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),documentId:z.uuid(),archived:z.enum(["true","false"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return;const {supabase}=await requireProject(parsed.data.organisationId,parsed.data.projectId);await supabase.rpc("set_document_archived",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_document:parsed.data.documentId,archived:parsed.data.archived==="true"});redirect(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/documents`)}
export async function createWorkPackage(_:MutationState,form:FormData):Promise<MutationState>{const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),packageNumber:z.string().trim().toUpperCase().min(2).max(80),name:z.string().trim().min(2).max(160),purpose:z.string().trim().max(1000),discipline:z.string().trim().max(80),requiredStatus:optionalIssueStatus,destination:z.enum(["local","sharepoint","google_drive"])}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Enter valid package details."};const {supabase}=await requireProject(parsed.data.organisationId,parsed.data.projectId);const {data,error}=await supabase.rpc("create_frozen_work_package",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,new_number:parsed.data.packageNumber,new_name:parsed.data.name,new_purpose:parsed.data.purpose,filter_discipline:parsed.data.discipline,required_status:parsed.data.requiredStatus,target_destination:parsed.data.destination});if(error)return {message:error.code==="23505"?"That package number and version already exist.":`Package could not be created. Reference: ${error.code}.`};redirect(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/work-packages/${data}`)}
export async function createDocumentTransmittal(_:MutationState,form:FormData):Promise<MutationState>{
 const fields=z.object({organisationId:z.uuid(),projectId:z.uuid(),transmittalNumber:z.string().trim().toUpperCase().min(2).max(80),recipientCompany:z.string().trim().min(2).max(160),recipientContact:z.string().trim().max(120),recipientEmail:z.union([z.email().max(254),z.literal("")]),purpose:z.string().trim().min(2).max(160),message:z.string().trim().max(2000)}).safeParse(Object.fromEntries(form));
 const revisions=z.array(z.uuid()).min(1).max(100).safeParse(form.getAll("revisionIds"));
 if(!fields.success||!revisions.success)return {message:"Enter the recipient details and select at least one accepted revision."};
 let projectAccess:Awaited<ReturnType<typeof requireProject>>;
 try{projectAccess=await requireProject(fields.data.organisationId,fields.data.projectId)}catch{return {message:"EngiCite could not reach the secure project service. Refresh the page and try again."}}
 const {supabase,access}=projectAccess;if(String(access.role)!=="document_controller")return {message:"Only the appointed Document Controller can issue a client transmittal."};
 let result:Awaited<ReturnType<typeof supabase.rpc>>;
 try{result=await supabase.rpc("create_document_transmittal",{target_organisation:fields.data.organisationId,target_project:fields.data.projectId,new_number:fields.data.transmittalNumber,recipient_company:fields.data.recipientCompany,recipient_contact:fields.data.recipientContact,recipient_email:fields.data.recipientEmail,new_purpose:fields.data.purpose,new_message:fields.data.message,selected_revision_ids:revisions.data})}catch{return {message:"The secure database connection was interrupted, so creation could not be confirmed. Check Work packages before trying again."}}
 const {data,error}=result;
 if(error)return {message:error.code==="23505"?"That transmittal number already exists.":error.code==="PGRST202"?"The transmittal database update has not been applied yet.":error.code==="42501"?"One or more selected revisions are no longer accepted and ready. Refresh the page and select again.":`Transmittal could not be created. Reference: ${error.code}.`};
 redirect(`/app/${fields.data.organisationId}/projects/${fields.data.projectId}/work-packages/${data}`)
}
export async function updateDocumentPlan(_:MutationState,form:FormData):Promise<MutationState>{const optionalDate=z.preprocess(v=>v===""?null:v,z.iso.date().nullable());const parsed=z.object({organisationId:z.uuid(),projectId:z.uuid(),documentId:z.uuid(),responsibleParty:z.string().trim().max(80),plannedSubmissionDate:z.iso.date(),plannedFinalDate:optionalDate,requiredIssueStatus:z.string().trim().max(80),progressWeight:z.coerce.number().positive().max(1000)}).safeParse(Object.fromEntries(form));if(!parsed.success)return {message:"Enter the agreed submission date, valid planning details and a positive progress weight."};const {supabase}=await requireProject(parsed.data.organisationId,parsed.data.projectId);if(parsed.data.requiredIssueStatus&&!isDocumentIssueStatus(parsed.data.requiredIssueStatus)){const {data:existing}=await supabase.from("documents").select("required_issue_status").eq("organisation_id",parsed.data.organisationId).eq("project_id",parsed.data.projectId).eq("id",parsed.data.documentId).maybeSingle();if(existing?.required_issue_status!==parsed.data.requiredIssueStatus)return {message:"Choose a controlled issue status from the list."}}const {error}=await supabase.rpc("update_document_plan",{target_organisation:parsed.data.organisationId,target_project:parsed.data.projectId,target_document:parsed.data.documentId,new_responsible:parsed.data.responsibleParty,new_submission:parsed.data.plannedSubmissionDate,new_final:parsed.data.plannedFinalDate,new_required_status:parsed.data.requiredIssueStatus,new_weight:parsed.data.progressWeight});if(error)return {message:`Document plan could not be updated. Reference: ${error.code}.`};revalidatePath(`/app/${parsed.data.organisationId}/projects/${parsed.data.projectId}/progress`);return {message:"Document plan updated."}}
