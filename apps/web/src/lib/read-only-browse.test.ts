import {describe,expect,it,vi} from "vitest";
import {browseHref,browsePage,browseSearch,browseTextFilter,readBrowseIndex,readBrowsePage,sliceBrowsePage} from "./read-only-browse";

describe("read-only browse URL state",()=>{
  it("normalises repeated values and rejects invalid pages without changing records",()=>{
    expect(browsePage(["3","8"])).toBe(3);
    for(const value of [undefined,"-1","0","1.5","NaN","1000001","999999999999999999999"])expect(browsePage(value)).toBe(1);
    expect(browseSearch('  design,(IFD)%"\\\n  ')).toBe("designIFD");
    expect(browseHref("/app/notifications",{q:"Cable spec",unread:"1",page:2})).toBe("/app/notifications?q=Cable+spec&unread=1&page=2");
    expect(browseHref("/app/notifications",{q:"",page:1})).toBe("/app/notifications");
    expect(browseTextFilter('x),title.eq.secret',["title","body"])).toBe("title.ilike.%xtitle.eq.secret%,body.ilike.%xtitle.eq.secret%");
  });
  it("clamps a page while preserving supplied ordering",()=>{
    const rows=Array.from({length:29},(_,index)=>index);
    expect(sliceBrowsePage(rows,9)).toMatchObject({items:[25,26,27,28],total:29,page:2,pages:2,start:25});
  });
});
describe("verified browsing reads",()=>{
  it("reads every indexed record even when the provider caps pages below the requested size",async()=>{
    const rows=Array.from({length:8},(_,index)=>({id:String(index)}));
    const read=vi.fn(async(start:number)=>({data:rows.slice(start,start+3),count:rows.length,error:null}));
    expect(await readBrowseIndex(read)).toEqual(rows);
    expect(read.mock.calls.map(call=>call[0])).toEqual([0,3,6]);
  });
  it("bounds metadata scans independently of an untrusted exact count",async()=>{
    const read=vi.fn(async()=>({data:[],count:50001,error:null}));
    await expect(readBrowseIndex(read)).rejects.toThrow("Browse unavailable");expect(read).toHaveBeenCalledTimes(1);
  });
  it.each(["missing-count","error","empty-cap","duplicate","changed-count"])("never labels an incomplete index as complete: %s",async problem=>{
    let calls=0;
    const read=async()=>{calls++;return {data:problem==="empty-cap"?[]:[{id:problem==="duplicate"?"same":String(calls)}],count:problem==="missing-count"?null:problem==="changed-count"?calls+1:2,error:problem==="error"?new Error("private"):null};};
    await expect(readBrowseIndex(read)).rejects.toThrow("Browse unavailable");
  });
  it("clamps out-of-range pages using the exact filtered count",async()=>{
    const rows=Array.from({length:28},(_,index)=>({id:String(index)}));
    const read=vi.fn(async(start:number,end:number)=>({data:rows.slice(start,end+1),count:rows.length,error:null}));
    expect(await readBrowsePage(read,6)).toMatchObject({items:rows.slice(25),page:2,pages:2,total:28,start:25});
    expect(read.mock.calls).toEqual([[125,149],[25,49]]);
  });
  it("recovers a PostgREST range error with a scoped first-page count probe",async()=>{
    const rows=Array.from({length:28},(_,index)=>({id:String(index)}));
    const read=vi.fn(async(start:number,end:number)=>start>=rows.length?{data:null,count:null,error:{code:"PGRST103"}}:{data:rows.slice(start,end+1),count:rows.length,error:null});
    expect(await readBrowsePage(read,6)).toMatchObject({items:rows.slice(25),page:2,pages:2,total:28,start:25});
    expect(read.mock.calls).toEqual([[125,149],[0,24],[25,49]]);
  });
  it("reuses the verified first page when an out-of-range search now has no matches",async()=>{
    const read=vi.fn(async(start:number)=>start>0?{data:null,count:null,error:{code:"PGRST103"}}:{data:[],count:0,error:null});
    expect(await readBrowsePage(read,6)).toMatchObject({items:[],page:1,pages:1,total:0,start:0});
    expect(read).toHaveBeenCalledTimes(2);
  });
  it("never treats unrelated errors or failed range probes as an empty result",async()=>{
    const unrelated=vi.fn(async()=>({data:null,count:null,error:{code:"42501"}}));
    await expect(readBrowsePage(unrelated,6)).rejects.toThrow("Browse unavailable");expect(unrelated).toHaveBeenCalledTimes(1);
    const deniedProbe=vi.fn().mockResolvedValueOnce({data:null,count:null,error:{code:"PGRST103"}}).mockResolvedValueOnce({data:null,count:null,error:{code:"42501"}});
    await expect(readBrowsePage(deniedProbe,6)).rejects.toThrow("Browse unavailable");expect(deniedProbe).toHaveBeenCalledTimes(2);
    const inconsistent=vi.fn().mockResolvedValueOnce({data:null,count:null,error:{code:"PGRST103"}}).mockResolvedValueOnce({data:Array.from({length:25},(_,index)=>({id:String(index)})),count:200,error:null});
    await expect(readBrowsePage(inconsistent,6)).rejects.toThrow("Browse unavailable");
  });
  it("returns a genuine zero only after a successful exact-count read",async()=>{
    expect(await readBrowsePage(async()=>({data:[],count:0,error:null}),1)).toMatchObject({total:0,items:[],page:1});
    await expect(readBrowsePage(async()=>({data:null,count:null,error:new Error("private")}),1)).rejects.toThrow("Browse unavailable");
    await expect(readBrowsePage(async()=>({data:[],count:10,error:null}),1)).rejects.toThrow("Browse unavailable");
  });
});
