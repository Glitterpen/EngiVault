import {expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadNotificationDocumentContext} from "./notification-document-context";
const org="11111111-1111-4111-8111-111111111111",project="22222222-2222-4222-8222-222222222222",document="33333333-3333-4333-8333-333333333333";
const href=`/app/${org}/projects/${project}/documents/${document}#revision`;
function client(data:unknown[],error:unknown=null){return {from:vi.fn(()=>({select:()=>({in:vi.fn(async()=>({data,error}))})}))} as unknown as SupabaseClient;}
it("enriches only matching tenant, project and permitted document",async()=>{
  const db=client([{id:document,organisation_id:org,project_id:project,document_number:"DOC-01",title:"Equipment list",discipline:"Mechanical"}]);
  const result=await loadNotificationDocumentContext(db,[{id:"notice",href},{id:"wrong",href:href.replace(org,project)}]);
  expect(result.get("notice")).toEqual({number:"DOC-01",title:"Equipment list",discipline:"Mechanical"});
  expect(result.has("wrong")).toBe(false);
});
it("does not query external or non-document links",async()=>{
  const db=client([]);
  expect((await loadNotificationDocumentContext(db,[{id:"n",href:`https://example.test${href}`}])).size).toBe(0);
  expect(db.from).not.toHaveBeenCalled();
});
it("keeps optional identity absent on access or service errors",async()=>{
  expect((await loadNotificationDocumentContext(client([],{message:"denied"}),[{id:"n",href}])).size).toBe(0);
});
