"use client";
import {useRouter} from "next/navigation";
import {useTransition} from "react";
import {RefreshCw} from "lucide-react";
export function ExecutiveRefresh(){
  const router=useRouter();
  const [pending,startTransition]=useTransition();
  return <button type="button" className="ev-button-secondary" disabled={pending} onClick={()=>startTransition(()=>router.refresh())}><RefreshCw size={15}/>{pending?"Refreshing…":"Refresh status"}</button>;
}
