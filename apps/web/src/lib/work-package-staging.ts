import {z} from "zod";

const packageRevision=z.object({id:z.uuid(),revision_code:z.string(),issue_status:z.string().nullable()});
export const workPackageStagingSchema=z.object({
  updated_at:z.iso.datetime({offset:true}),
  preferred_status:z.string().nullable(),
  documents:z.array(z.object({
    id:z.uuid(),document_number:z.string(),discipline:z.string(),document_type:z.string(),
    revision_id:z.uuid().nullable(),inclusion_state:z.string(),revisions:z.array(packageRevision),
  })),
});
export type WorkPackageStagingData=z.infer<typeof workPackageStagingSchema>;

export function hasGeneratableSelection(staging:WorkPackageStagingData):boolean{
  let included=false;
  for(const item of staging.documents){
    if(item.inclusion_state==="excluded"&&item.revision_id===null)continue;
    if(item.inclusion_state!=="included"||!item.revisions.some(revision=>revision.id===item.revision_id))return false;
    included=true;
  }
  return included;
}
