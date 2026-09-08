import {requireAuthenticatedUser} from "@/lib/auth";

export default async function PreviewUnavailablePage(){
  await requireAuthenticatedUser();
  return <main className="ev-card mx-auto my-12 max-w-xl p-8"><h1 className="text-xl font-semibold">Exit member preview to continue</h1><p className="mt-3 text-sm leading-6">This page is outside the selected member’s project preview, or the preview has expired. Exit to return to your administrator workspace.</p><form className="mt-5" action="/api/admin-preview/exit" method="post"><button className="ev-button">Exit preview</button></form></main>;
}
