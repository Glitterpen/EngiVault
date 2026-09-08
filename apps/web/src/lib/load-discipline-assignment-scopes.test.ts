// @vitest-environment node
import {expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadDisciplineAssignmentScopes} from "./load-discipline-assignment-scopes";
vi.mock("server-only",()=>({}));

const engineer={userId:"engineer",name:"Engineer",email:"engineer@example.test",disciplines:["Electrical"]};
function client(failTable?:string,failOffset=0){
  const filters:{table:string;column:string;value:unknown}[]=[];
  const ranges:{table:string;offset:number}[]=[];
  const from=vi.fn((table:string)=>{
    const rows=table==="documents"?Array.from({length:5},(_,id)=>({id:String(id),discipline:"Electrical"})):Array.from({length:5},(_,id)=>({id:String(id),document_id:String(id),user_id:"engineer"}));
    const query={
      select:vi.fn(()=>query),eq:vi.fn((column:string,value:unknown)=>{filters.push({table,column,value});return query}),order:vi.fn(()=>query),
      range:vi.fn(async(offset:number)=>{
        ranges.push({table,offset});
        return table===failTable&&offset===failOffset?{data:null,error:{code:"READ_FAILED"},count:null}:{data:rows.slice(offset,offset+2),count:rows.length,error:null};
      }),
    };
    return query;
  });
  return {supabase:{from} as unknown as SupabaseClient,filters,ranges};
}
it("reads every page even if the server row cap is smaller than the requested page",async()=>{
  const fixture=client();
  const result=await loadDisciplineAssignmentScopes(fixture.supabase,"org","project",[engineer]);
  expect(result).toMatchObject({available:true,scopes:[{documentCount:5,engineers:[{assignedCount:5,remainingCount:0}]}]});
  expect(fixture.ranges.filter(item=>item.table==="documents").map(item=>item.offset)).toEqual([0,2,4]);
  expect(fixture.ranges.filter(item=>item.table==="document_assignments").map(item=>item.offset)).toEqual([0,2,4]);
  for(const table of ["documents","document_assignments"]){
    expect(fixture.filters).toContainEqual({table,column:"organisation_id",value:"org"});
    expect(fixture.filters).toContainEqual({table,column:"project_id",value:"project"});
  }
  expect(fixture.filters).toContainEqual({table:"documents",column:"lifecycle_status",value:"active"});
  expect(fixture.filters).toContainEqual({table:"document_assignments",column:"status",value:"active"});
});
it.each(["documents","document_assignments"])("fails closed when %s cannot be read",async table=>{
  expect(await loadDisciplineAssignmentScopes(client(table).supabase,"org","project",[engineer])).toEqual({available:false,scopes:[]});
});
it("does not show misleading partial counts after a later-page failure",async()=>{
  expect(await loadDisciplineAssignmentScopes(client("document_assignments",2).supabase,"org","project",[engineer])).toEqual({available:false,scopes:[]});
});
