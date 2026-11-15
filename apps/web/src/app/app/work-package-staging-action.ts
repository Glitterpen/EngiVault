"use server";

import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {z} from "zod";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";

type StagingResult={message:string}|undefined;
const target=z.object({organisationId:z.uuid(),projectId:z.uuid(),packageId:z.uuid()});
const details=target.extend({updatedAt:z.iso.datetime({offset:true}),selection:z.string().max(2_500_000)});
const selections=z.array(z.object({item_id:z.uuid(),revision_id:z.uuid().nullable()}).strict()).min(1).max(20_000);

export async function saveWorkPackageStaging(_:StagingResult,form:FormData):Promise<StagingResult>{
  const input=details.safeParse(Object.fromEntries(form));
  if(!input.success)return {message:"The package selection could not be read. Reload the package before trying again."};
  const {organisationId,projectId,packageId,updatedAt,selection}=input.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview||!can(String(access.role),"document:write"))return {message:"Only the project’s Document Controller can edit package selections outside of preview."};

  let payload:unknown;
  try{payload=JSON.parse(selection);}catch{return {message:"The package selection could not be read. Reload the package before trying again."};}
  const choices=selections.safeParse(payload);
  if(!choices.success||new Set(choices.data.map(choice=>choice.item_id)).size!==choices.data.length){
    return {message:"The package selection is incomplete or contains a duplicate document. Reload the package before trying again."};
  }
  if(!choices.data.some(choice=>choice.revision_id))return {message:"Include at least one document with an eligible revision."};

  let result:Awaited<ReturnType<typeof supabase.rpc>>;
  try{
    result=await supabase.rpc("save_work_package_staging",{
      target_organisation:organisationId,target_project:projectId,target_package:packageId,
      expected_updated_at:updatedAt,selection:choices.data,
    });
  }catch{return {message:"The selection could not be saved. Reload the package to check before trying again."};}
  if(result.error){
    if(result.error.code==="55000")return {message:"The package or a selected revision changed. Reload the package and review your selections before saving again."};
    if(result.error.code==="42501"||result.error.code==="P0002")return {message:"This package is no longer available for editing."};
    if(result.error.code==="22023")return {message:"The selection no longer matches this package. Reload the package and review the included revisions and exclusions."};
    return {message:"The selection could not be saved. Please try again shortly."};
  }
  const path=`/app/${organisationId}/projects/${projectId}/work-packages`;
  revalidatePath(path);
  revalidatePath(`${path}/${packageId}`);
  redirect(`${path}/${packageId}`);
}

export async function restageWorkPackage(_:StagingResult,form:FormData):Promise<StagingResult>{
  const input=target.safeParse(Object.fromEntries(form));
  if(!input.success)return {message:"This package could not be opened for restaging. Reload the page before trying again."};
  const {organisationId,projectId,packageId}=input.data;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  if(preview||!can(String(access.role),"document:write"))return {message:"Only the project’s Document Controller can stage a new version outside of preview."};

  let result:Awaited<ReturnType<typeof supabase.rpc>>;
  try{
    result=await supabase.rpc("restage_work_package",{target_organisation:organisationId,target_project:projectId,target_package:packageId});
  }catch{return {message:"A new version could not be opened. Check the work package list before retrying."};}
  if(result.error?.code==="55000"&&result.error.message==="work_package_restage_stale")return {message:"A newer version of this package exists. Open the latest version from the work package list before restaging."};
  if(result.error?.code==="42501"||result.error?.code==="55000")return {message:"This package is no longer available for restaging."};
  const versionId=z.uuid().safeParse(result.data);
  if(result.error||!versionId.success)return {message:"A new version could not be opened. Check the work package list before retrying."};

  const path=`/app/${organisationId}/projects/${projectId}/work-packages`;
  revalidatePath(path);
  redirect(`${path}/${versionId.data}`);
}
