import {describe,expect,it,vi} from "vitest";
import type {SupabaseClient} from "@supabase/supabase-js";
import {loadDocumentSchedules} from "./document-schedule";
describe("scoped schedule loading",()=>{
  it("bounds each query and retains org/project scope",async()=>{
    const query={select:vi.fn(),eq:vi.fn(),in:vi.fn()};query.select.mockReturnValue(query);query.eq.mockReturnValue(query);
    query.in.mockImplementation(async(_key,ids:string[])=>({data:ids.map(document_id=>({document_id})),error:null}));
    const from=vi.fn(()=>query);const ids=Array.from({length:205},(_,i)=>String(i));
    const result=await loadDocumentSchedules({from} as unknown as SupabaseClient,"org","project",ids);
    expect(result.size).toBe(205);expect(query.in.mock.calls.map(call=>call[1].length)).toEqual([100,100,5]);
    expect(query.eq).toHaveBeenCalledWith("organisation_id","org");expect(query.eq).toHaveBeenCalledWith("project_id","project");
  });
  it("does not silently display stale deadlines if schedules fail",async()=>{
    const query={select:()=>query,eq:()=>query,in:async()=>({data:null,error:{code:"42703"}})};
    await expect(loadDocumentSchedules({from:()=>query} as unknown as SupabaseClient,"org","project",["doc"])).rejects.toThrow("temporarily unavailable");
  });
});
