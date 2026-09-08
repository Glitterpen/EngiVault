// @vitest-environment node
import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {SupabaseClient} from '@supabase/supabase-js';
vi.mock('server-only',()=>({}));
vi.mock('@/lib/env',()=>({publicEnv:()=>({NEXT_PUBLIC_SUPABASE_URL:'https://preview.example.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'public-placeholder-key-for-test'})}));
import {createMemberPreviewClient} from './member-preview-client';
import type {AdminPreview} from './admin-preview';
const preview:AdminPreview={sessionId:'session-id',organisationId:'org-id',projectId:'project-id',memberId:'member-id',role:'engineer',displayName:'Engineer',email:'engineer@example.test',disciplines:['Electrical'],expiresAt:'2026-09-09T00:00:00Z'};
const rpc=vi.fn();
const actor={rpc} as unknown as SupabaseClient;
beforeEach(()=>rpc.mockReset());
describe('member preview Supabase transport',()=>{
 it('uses only authenticated read delegation and preserves count/embedded rows',async()=>{
   rpc.mockResolvedValue({data:{rows:[{id:'d1',document_revisions:[{state:'ready'}]}],total:31},error:null});
   const client=createMemberPreviewClient(actor,preview);
   const result=await client.from('documents').select('id,document_revisions(state)',{count:'exact'}).eq('discipline','Electrical').range(25,49);
   expect(result.error).toBeNull();expect(result.count).toBe(31);expect(result.data).toEqual([{id:'d1',document_revisions:[{state:'ready'}]}]);
   expect(rpc).toHaveBeenCalledWith('read_project_member_preview',expect.objectContaining({target_preview:'session-id',resource:'documents',query:expect.objectContaining({offset:25,limit:25})}));
 });
 it('supports zero-row maybeSingle and exact single reads',async()=>{
   rpc.mockResolvedValueOnce({data:{rows:[],total:0},error:null}).mockResolvedValueOnce({data:{rows:[{id:'d1'}],total:1},error:null});
   const client=createMemberPreviewClient(actor,preview);
   expect((await client.from('documents').select('id').maybeSingle()).data).toBeNull();
   expect((await client.from('documents').select('id').single()).data).toEqual({id:'d1'});
 });
 it('does not fall back to admin data when delegation fails',async()=>{
   rpc.mockResolvedValue({data:null,error:{code:'42501'}});
   const result=await createMemberPreviewClient(actor,preview).from('documents').select('*');
   expect(result.data).toBeNull();expect(result.error?.message).toContain('Member preview unavailable');
   expect(rpc).toHaveBeenCalledTimes(1);
 });
 it.each(['insert','update','delete'] as const)('blocks %s before a network call',async(method)=>{
   const table=createMemberPreviewClient(actor,preview).from('documents');
   const result=await (method==='insert'?table.insert({title:'change'}):method==='update'?table.update({title:'change'}):table.delete());
   expect(result.error?.message).toContain('Changes are disabled');expect(rpc).not.toHaveBeenCalled();
 });
 it('blocks mutation RPCs and mismatched scopes',async()=>{
   const client=createMemberPreviewClient(actor,preview);
   expect((await client.rpc('assign_document',{})).error?.message).toContain('Changes are disabled');
   expect((await client.rpc('get_project_team',{target_organisation:'another-org'})).error?.message).toContain('mismatch');
   expect(rpc).not.toHaveBeenCalled();
 });
 it('uses member identity for aggregate RPCs without changing actor credentials',async()=>{
   rpc.mockResolvedValue({data:{engineer_total_documents:2},error:null});
   expect((await createMemberPreviewClient(actor,preview).rpc('get_engineer_project_impact',{target_project:'project-id'})).data).toEqual({engineer_total_documents:2});
   expect(rpc).toHaveBeenCalledWith('read_project_member_preview',{target_preview:'session-id',resource:'get_engineer_project_impact',query:{target_project:'project-id'}});
 });
 it('checks the exact object under member RLS before signing with the actor',async()=>{
   rpc.mockResolvedValue({data:{name:'org/project/file.pdf'},error:null});
   const sign=vi.fn().mockResolvedValue({data:{signedUrl:'https://preview.example.test/storage/v1/object/sign/documents/org/project/file.pdf?token=test-only'},error:null});
   const storageActor={rpc,storage:{from:vi.fn(()=>({createSignedUrl:sign}))}} as unknown as SupabaseClient;
   const result=await createMemberPreviewClient(storageActor,preview).storage.from('documents').createSignedUrl('org/project/file.pdf',900,{download:'file.pdf'});
   expect(result.error).toBeNull();expect(result.data?.signedUrl).toContain('/storage/v1/object/sign/documents/');
   expect(rpc).toHaveBeenCalledWith('read_project_member_preview',{target_preview:'session-id',resource:'storage_object',query:{bucket:'documents',path:'org/project/file.pdf'}});
   expect(sign).toHaveBeenCalledWith('org/project/file.pdf',300);
 });
 it('never signs a file denied by member storage RLS',async()=>{
   rpc.mockResolvedValue({data:null,error:{code:'42501'}});
   const from=vi.fn();const storageActor={rpc,storage:{from}} as unknown as SupabaseClient;
   const result=await createMemberPreviewClient(storageActor,preview).storage.from('documents').createSignedUrl('foreign/file.pdf',60);
   expect(result.error).not.toBeNull();expect(from).not.toHaveBeenCalled();
 });
});
