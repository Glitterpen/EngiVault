import Link from "next/link";
import {notFound} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {RemovedAccountDelete} from "@/components/removed-account-delete";

type RemovedAccount={user_id:string;display_name:string;email:string|null;blocker:string|null;deletion_state:string|null;total_count:number};

export default async function RemovedAccounts({params,searchParams}:{params:Promise<{organisationId:string}>;searchParams:Promise<{q?:string;page?:string}>}){
  const {organisationId}=await params;
  const query=await searchParams;
  const search=typeof query.q==="string"?query.q.slice(0,100):"";
  const page=Math.min(40000,Math.max(0,Number.parseInt(query.page??"0",10)||0));
  const {supabase}=await requireUser();
  const {data:organisation}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).eq("role","organisation_admin").maybeSingle();
  if(!organisation)notFound();
  const {data,error}=await supabase.rpc("list_removed_organisation_users",{target_organisation:organisationId,search_text:search,page_offset:page*25});
  const rows=(data??[]) as RemovedAccount[];
  const href=(index:number)=>`?${new URLSearchParams({q:search,page:String(index)})}`;
  return <div className="mx-auto max-w-3xl">
    <Link className="text-sm font-semibold text-[#0c5b45]" href={`/app/${organisationId}/settings`}>← Manage organisation</Link>
    <h1 className="mt-6 text-3xl font-semibold">Removed team accounts</h1>
    <p className="mt-3 text-sm leading-6 text-[#617083]">After a Project Manager removes a team member, an Organisation Administrator can delete their login here. All project appointments must be removed first. Other organisations’ access and protected administrator accounts cannot be deleted.</p>
    <form className="my-5 flex gap-2"><label className="min-w-0 flex-1"><span className="sr-only">Search removed accounts</span><input className="ev-input w-full" name="q" placeholder="Search name or email" defaultValue={search} maxLength={100}/></label><button className="ev-button-secondary">Search</button></form>
    {error?<p role="alert" className="ev-card p-5">Account management is temporarily unavailable. Contact EngiCite support if this continues.</p>:<>
      <div className="grid gap-4">{rows.length?rows.map(account=><section key={account.user_id} className="ev-card min-w-0 p-5">
        <h2 className="break-words font-semibold">{account.display_name}</h2>
        {account.email&&<p className="mb-3 mt-1 break-all text-sm text-[#617083]">{account.email}</p>}
        {account.deletion_state?<p className="mt-2 text-sm" role="status">{account.deletion_state==="completed"?"Account deleted. A new invitation and account are required.":"Access revoked — account deletion is pending. Refresh this page to check completion; contact EngiCite support if it remains pending."}</p>:account.blocker?<p className="mt-2 text-sm text-[#617083]">{account.blocker}</p>:account.email&&<RemovedAccountDelete organisationId={organisationId} userId={account.user_id} email={account.email}/>}
      </section>):<p className="ev-card p-5 text-sm">No removed accounts match this view.</p>}</div>
      <nav aria-label="Removed accounts pages" className="mt-5 flex gap-4">{page>0&&<Link href={href(page-1)}>Previous</Link>}{(rows[0]?.total_count??0)>(page+1)*25&&<Link href={href(page+1)}>Next</Link>}</nav>
    </>}
  </div>;
}
