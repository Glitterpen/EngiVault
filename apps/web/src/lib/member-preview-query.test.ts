import {describe,expect,it} from 'vitest';
import {previewQuery,projectPreviewRow,parseSelection,splitQuery} from './member-preview-query';

describe('read-only project query grammar',()=>{
 it('preserves embedded revisions and pagination',()=>{
   const {query,selection}=previewQuery(new URL('https://example.test/documents?select=id,document_revisions(state)&limit=25&offset=25&order=document_number.asc&discipline=eq.Electrical'));
   expect(query).toMatchObject({limit:25,offset:25,embeds:['document_revisions'],filters:[{column:'discipline',op:'eq',value:'Electrical'}]});
   expect(projectPreviewRow({id:'doc',privateField:'not selected',document_revisions:[{state:'ready',extra:'omit'}]},selection)).toEqual({id:'doc',document_revisions:[{state:'ready'}]});
 });
 it('handles inner joins and aliases without returning extra fields',()=>{
   const selection=parseSelection('id,doc:documents!inner(document_number,title)');
   expect(projectPreviewRow({id:'rev',documents:{document_number:'E-01',title:'Title',storage_key:'omit'}},selection)).toEqual({id:'rev',doc:{document_number:'E-01',title:'Title'}});
 });
 it('keeps commas in discipline values and parses OR search',()=>{
   expect(splitQuery('"Controls, Automation","Electrical"')).toEqual(['"Controls, Automation"','"Electrical"']);
   const {query}=previewQuery(new URL('https://example.test/documents?or=(title.ilike.*pump*,document_number.ilike.*pump*)&id=in.("a,b",c)&read_at=is.null'));
   expect(query.filters[0]).toMatchObject({op:'or',filters:[{column:'title',op:'ilike',value:'%pump%'},{column:'document_number',op:'ilike',value:'%pump%'}]});
   expect(query.filters[1].values).toEqual(['a,b','c']);
 });
 it.each(['select=id::text','select=count()','order=id.desc;delete','id=rpc.evil','or=(id.eq.x','select=id);delete'])('rejects unknown/injected grammar: %s',(query)=>{
   expect(()=>previewQuery(new URL('https://example.test/documents?'+query))).toThrow();
 });
});
