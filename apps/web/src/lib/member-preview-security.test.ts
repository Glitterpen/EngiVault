import {describe,expect,it} from 'vitest';
import {memberPreviewRequestAllowed} from './member-preview-security';
const org='62000000-0000-4000-8000-000000000001',project='63000000-0000-4000-8000-000000000001';
const cookie=`${org}:${project}:64000000-0000-4000-8000-000000000001`;
const base=`/app/${org}/projects/${project}`,api=`/api/v1/organisations/${org}/projects/${project}`;
describe('member preview request boundary',()=>{
 it.each([base+'/assignments',base+'/reports',base+'/documents/id',api+'/workspace-context',api+'/search','/app/notifications'])('allows scoped reads %s',path=>expect(memberPreviewRequestAllowed('GET',path,cookie)).toBe(true));
 it.each(['POST','PATCH','PUT','DELETE'])('denies %s on project AND global actions',method=>{
   for(const path of [base+'/team',api+'/documents','/app','/app/notifications','/api/v1/notifications/id/read'])expect(memberPreviewRequestAllowed(method,path,cookie)).toBe(false);
 });
 it('allows only the audited exit POST',()=>expect(memberPreviewRequestAllowed('POST','/api/admin-preview/exit',cookie)).toBe(true));
 it('allows an expired/legacy cookie to exit but not browse',()=>{
   expect(memberPreviewRequestAllowed('POST','/api/admin-preview/exit',org+':'+project+':engineer')).toBe(true);
   expect(memberPreviewRequestAllowed('GET',base+'/assignments',org+':'+project+':engineer')).toBe(false);
 });
 it.each(['/app','/founder',base+'/administration',api+'/backups/id/download','/api/v1/billing/paystack/checkout',base+'bad/assignments'])('rejects escaping member scope %s',path=>expect(memberPreviewRequestAllowed('GET',path,cookie)).toBe(false));
});
