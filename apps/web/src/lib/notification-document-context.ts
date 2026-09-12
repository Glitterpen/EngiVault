import type {SupabaseClient} from "@supabase/supabase-js";

type Notice={id:string;href?:string|null};
export type NotificationDocumentContext={number:string;title:string;discipline:string};
const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const documentPath=new RegExp(`^/app/(${uuid})/projects/(${uuid})/documents/(${uuid})(?:/|[?#]|$)`,"i");

// Use the existing authenticated (or audited read-preview) client. Never elevate
// privileges to enrich an inbox, and never trust a URL as proof of tenant access.
export async function loadNotificationDocumentContext(client:SupabaseClient,notices:Notice[]){
  const references=notices.flatMap(notice=>{
    const match=notice.href?.match(documentPath);
    return match?[{noticeId:notice.id,org:match[1].toLowerCase(),project:match[2].toLowerCase(),document:match[3].toLowerCase()}]:[];
  });
  const context=new Map<string,NotificationDocumentContext>();
  const ids=[...new Set(references.map(ref=>ref.document))];
  for(let offset=0;offset<ids.length;offset+=50){
    const {data,error}=await client.from("documents")
      .select("id,organisation_id,project_id,document_number,title,discipline")
      .in("id",ids.slice(offset,offset+50));
    if(error)continue; // Optional context must not make an otherwise valid inbox fail.
    for(const row of data??[]){
      for(const ref of references){
        if(row.id===ref.document&&row.organisation_id===ref.org&&row.project_id===ref.project){
          context.set(ref.noticeId,{number:row.document_number,title:row.title,discipline:row.discipline});
        }
      }
    }
  }
  return context;
}
