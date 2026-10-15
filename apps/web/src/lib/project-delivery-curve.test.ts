import {describe,expect,it} from "vitest";
import {buildProjectDeliveryCurve,type DeliveryCurveDocument,type DeliveryCurveReport} from "./project-delivery-curve";

const asOf="2026-10-15T12:00:00Z";
function document(id:string,progress_weight=1,progress_credit=0,planned_final_date:string|null="2026-10-31"):DeliveryCurveDocument{return {document_id:id,progress_weight,progress_credit,planned_final_date};}
function report(id:string,period_end="2026-10-08",progress:unknown=20,generated_at=`${period_end}T16:00:00Z`):DeliveryCurveReport{return {id,period_end,generated_at,snapshot:{summary:{overall_progress:progress}}};}
function curve(overrides:Partial<Parameters<typeof buildProjectDeliveryCurve>[0]>={}){
  return buildProjectDeliveryCurve({documents:[document("one",1,33,"2026-10-01"),document("two",3,100)],reports:[],asOf,plannedStart:"2026-10-01",plannedEnd:"2026-10-31",historyAvailable:true,...overrides});
}

describe("live current-baseline delivery curve",()=>{
  it("uses stage-weighted live credit and weighted terminal dates with signed actual-minus-plan variance",()=>{
    const result=curve();
    expect(result).toMatchObject({asOf:"2026-10-15T12:00:00.000Z",actualToday:83,plannedToday:25,variance:58,plannedCoverage:100,undatedCount:0,hasScope:true,historyAvailable:true,historyCount:0,invalidHistoryCount:0});
    expect(result.points.find(point=>point.date==="2026-10-15")).toEqual({date:"2026-10-15",planned:25,actual:83,actualSource:"live"});
    expect(result.points.find(point=>point.date==="2026-10-31")).toEqual({date:"2026-10-31",planned:100,actual:null,actualSource:null});
    expect(result.points.map(point=>point.date)).toEqual([...result.points.map(point=>point.date)].sort());
  });
  it("uses current stage credit as supplied rather than counting uploaded documents or terminal documents",()=>{
    const result=curve({documents:[document("one",1,33),document("two",1,67),document("three",1,0)]});
    expect(result.actualToday).toBe(33);
    expect(result.points.find(point=>point.actualSource==="live")?.actual).toBe(33);
  });
  it("keeps one-decimal planned percentages and negative variance without rounding actual differently from dashboards",()=>{
    const result=curve({documents:[document("one",1,0,"2026-10-01"),document("two",2,0)]});
    expect(result.actualToday).toBe(0);expect(result.plannedToday).toBe(33.3);expect(result.variance).toBe(-33.3);
  });
  it("never substitutes the first planned submission date for the terminal planned date",()=>{
    const row={...document("one",1,33,null),planned_submission_date:"2026-01-01"};
    const result=curve({documents:[row]});
    expect(result).toMatchObject({plannedCoverage:0,plannedToday:null,variance:null,undatedCount:1});
    expect(result.points.every(point=>point.planned===null)).toBe(true);
  });
  it("discloses partial weighted plan coverage instead of presenting undated work as zero or claiming a full baseline",()=>{
    const result=curve({documents:[document("dated",1,100,"2026-10-01"),document("undated",3,0,null)]});
    expect(result).toMatchObject({plannedCoverage:25,undatedCount:1,plannedToday:null,variance:null,actualToday:25});
    expect(result.points.find(point=>point.date==="2026-10-15")?.planned).toBe(25);
    expect(result.points.every(point=>point.planned!==null&&point.planned<=25)).toBe(true);
  });
  it("does not round a genuinely partial weighted baseline up to 100-percent coverage",()=>{
    const result=curve({documents:[document("dated",1000,100,"2026-10-01"),document("undated",0.01,0,null)]});
    expect(result.plannedCoverage).toBeLessThan(100);expect(result.plannedToday).toBeNull();expect(result.variance).toBeNull();
    expect(result.points.every(point=>point.planned===null||point.planned<=result.plannedCoverage)).toBe(true);
  });
  it("shows real zero plan before the first terminal deadline and full plan at a recorded terminal deadline",()=>{
    const result=curve({documents:[document("one",1,0,"2026-10-20")],plannedStart:"2026-10-01",plannedEnd:"2026-10-31"});
    expect(result.plannedToday).toBe(0);
    expect(result.points.find(point=>point.date==="2026-10-20")?.planned).toBe(100);
    expect(result.points.find(point=>point.date==="2026-10-01")?.planned).toBe(0);
  });
  it("does not fabricate a zero actual baseline or intermediate/future actual points",()=>{
    const result=curve({reports:[report("history","2026-10-08",17)]});
    expect(result.points.filter(point=>point.actual!==null)).toEqual([
      {date:"2026-10-08",planned:25,actual:17,actualSource:"report"},
      {date:"2026-10-15",planned:25,actual:83,actualSource:"live"},
    ]);
    expect(result.points.find(point=>point.date==="2026-10-01")?.actual).toBeNull();
    expect(result.points.filter(point=>point.date>"2026-10-15").every(point=>point.actual===null&&point.actualSource===null)).toBe(true);
  });
  it("keeps a genuine zero actual saved observation distinct from absent history",()=>{
    const result=curve({reports:[report("zero","2026-10-08",0)]});
    expect(result.historyCount).toBe(1);
    expect(result.points.find(point=>point.date==="2026-10-08")).toMatchObject({actual:0,actualSource:"report"});
  });
  it("always replaces today's saved report with the live current calculation",()=>{
    const result=curve({reports:[report("today","2026-10-15",99,"2026-10-15T09:00:00Z")]});
    expect(result.historyCount).toBe(0);
    expect(result.points.find(point=>point.date==="2026-10-15")).toMatchObject({actual:83,actualSource:"live"});
    expect(result.points.filter(point=>point.date==="2026-10-15")).toHaveLength(1);
  });
  it("respects availability of report history without hiding live actual or known plan",()=>{
    const result=curve({reports:[report("valid"),report("invalid","bad",500)],historyAvailable:false});
    expect(result).toMatchObject({historyAvailable:false,historyCount:0,invalidHistoryCount:0,actualToday:83,plannedToday:25});
    expect(result.points.filter(point=>point.actualSource==="report")).toEqual([]);
  });
  it("handles a genuinely empty current scope without inventing plan coverage",()=>{
    const result=curve({documents:[],reports:[],plannedStart:null,plannedEnd:null});
    expect(result).toMatchObject({hasScope:false,actualToday:0,plannedToday:null,variance:null,plannedCoverage:0,undatedCount:0,historyCount:0});
    expect(result.points).toEqual([{date:"2026-10-15",planned:null,actual:0,actualSource:"live"}]);
  });
  it("can retain a real historical report even if the current active scope is now empty",()=>{
    const result=curve({documents:[],reports:[report("old","2026-10-08",50)],plannedStart:null,plannedEnd:null});
    expect(result.hasScope).toBe(false);expect(result.historyCount).toBe(1);
    expect(result.points.find(point=>point.date==="2026-10-08")).toEqual({date:"2026-10-08",planned:null,actual:50,actualSource:"report"});
  });
});

describe("saved report observations",()=>{
  it("uses saved summary progress, not the old report curve, current document revisions or an invented interpolation",()=>{
    const saved={...report("snapshot","2026-10-08",21),snapshot:{summary:{overall_progress:21},s_curve:{overall:[{date:"2026-10-01",completed:999},{date:"2026-10-08",completed:999}]}}};
    const result=curve({reports:[saved]});
    expect(result.points.find(point=>point.date==="2026-10-08")?.actual).toBe(21);
    expect(result.points.find(point=>point.date==="2026-10-01")?.actual).toBeNull();
  });
  it("deduplicates one cutoff using latest generation time then stable report id regardless of response order",()=>{
    const reports=[report("z","2026-10-08",55,"2026-10-10T10:00:00Z"),report("old","2026-10-08",10,"2026-10-09T10:00:00Z"),report("a","2026-10-08",20,"2026-10-10T10:00:00Z")];
    const first=curve({reports}),second=curve({reports:[...reports].reverse()});
    expect(first.points).toEqual(second.points);
    expect(first.historyCount).toBe(1);expect(first.points.find(point=>point.date==="2026-10-08")?.actual).toBe(55);
  });
  it("does not let a malformed later report erase a valid earlier observation for the same cutoff",()=>{
    const result=curve({reports:[report("valid","2026-10-08",55),report("invalid","2026-10-08",300,"2026-10-12T10:00:00Z")]});
    expect(result.historyCount).toBe(1);expect(result.invalidHistoryCount).toBe(1);
    expect(result.points.find(point=>point.date==="2026-10-08")?.actual).toBe(55);
  });
  it("ignores valid future cutoff/generation timestamps without counting them as corrupt history",()=>{
    const result=curve({reports:[report("future-cutoff","2026-11-01",50,"2026-10-14T10:00:00Z"),report("future-generated","2026-10-01",50,"2026-10-15T12:00:01Z")]});
    expect(result.historyCount).toBe(0);expect(result.invalidHistoryCount).toBe(0);
    expect(result.points.every(point=>point.actualSource!=="report")).toBe(true);
  });
  it.each([NaN,Infinity,-Infinity,-1,100.1,undefined,null,"","bad",true,{},[]])("rejects malformed or out-of-range report progress %j instead of clamping a saved record",value=>{
    const result=curve({reports:[{...report("bad"),snapshot:{summary:{overall_progress:value}}}]});
    expect(result.historyCount).toBe(0);expect(result.invalidHistoryCount).toBe(1);
  });
  it.each([undefined,null,[],"{}",{}, {summary:null},{summary:[]},{summary:{}}])("rejects missing summary data %j",snapshot=>{
    const result=curve({reports:[{...report("bad"),snapshot}]});
    expect(result.historyCount).toBe(0);expect(result.invalidHistoryCount).toBe(1);
  });
  it("accepts safe finite numerical-string report percentages including zero",()=>{
    const result=curve({reports:[report("zero","2026-10-01","0"),report("number","2026-10-08","33.5")]});
    expect(result.historyCount).toBe(2);expect(result.invalidHistoryCount).toBe(0);
    expect(result.points.filter(point=>point.actualSource==="report").map(point=>point.actual)).toEqual([0,33.5]);
  });
  it.each([
    {period_end:"2026-02-30",generated_at:"2026-03-01T00:00:00Z"},
    {period_end:"not a date",generated_at:"2026-10-08T00:00:00Z"},
    {period_end:"2026-10-08",generated_at:"not a time"},
    {period_end:"2026-10-08",generated_at:"2026-02-30T00:00:00Z"},
    {period_end:"2026-10-08",generated_at:"2026-10-08T00:00:00"},
  ])("rejects invalid or timezone-ambiguous report dates %#",dates=>{
    const result=curve({reports:[{...report("bad"),...dates}]});
    expect(result.historyCount).toBe(0);expect(result.invalidHistoryCount).toBe(1);
  });
});

describe("bounded, robust curve timeline",()=>{
  it("normalizes as-of offsets to an authoritative UTC live date",()=>{
    const result=curve({asOf:"2026-10-16T00:30:00+02:00"});
    expect(result.asOf).toBe("2026-10-15T22:30:00.000Z");
    expect(result.points.find(point=>point.actualSource==="live")?.date).toBe("2026-10-15");
  });
  it.each(["","invalid","1","2026-02-30T12:00:00Z","2026-10-15T12:00:00"])("rejects invalid as-of %s rather than guessing the current time",asOf=>{
    expect(()=>curve({asOf})).toThrow("valid as-of timestamp");
  });
  it("treats invalid terminal dates as undated and ignores invalid project endpoint dates",()=>{
    const result=curve({documents:[document("bad",1,0,"2026-02-30")],plannedStart:"not a date",plannedEnd:"2026-99-01"});
    expect(result).toMatchObject({plannedCoverage:0,undatedCount:1,plannedToday:null});
    expect(result.points).toEqual([{date:"2026-10-15",planned:null,actual:0,actualSource:"live"}]);
  });
  it("includes real project boundaries without giving them fabricated actual values",()=>{
    const result=curve({plannedStart:"2026-09-01",plannedEnd:"2026-12-31"});
    expect(result.points.find(point=>point.date==="2026-09-01")).toMatchObject({planned:0,actual:null,actualSource:null});
    expect(result.points.find(point=>point.date==="2026-12-31")).toMatchObject({planned:100,actual:null,actualSource:null});
  });
  it("bounds long timelines and saved histories to 300 points while keeping first/latest retained history and live today",()=>{
    const reports=Array.from({length:600},(_,index)=>{
      const date=new Date(Date.UTC(2024,0,1+index)).toISOString().slice(0,10);
      return report(`report-${index}`,date,index%101,`${date}T12:00:00Z`);
    });
    const result=curve({reports,plannedStart:"2020-01-01",plannedEnd:"2035-12-31"});
    expect(result.points.length).toBeLessThanOrEqual(300);
    expect(result.historyCount).toBe(result.points.filter(point=>point.actualSource==="report").length);
    expect(result.historyCount).toBeGreaterThan(0);expect(result.historyCount).toBeLessThan(reports.length);
    expect(result.points.find(point=>point.date===reports[0].period_end)?.actualSource).toBe("report");
    expect(result.points.find(point=>point.date===reports.at(-1)!.period_end)?.actualSource).toBe("report");
    expect(result.points.filter(point=>point.actualSource==="live")).toHaveLength(1);
    expect(new Set(result.points.map(point=>point.date)).size).toBe(result.points.length);
  });
  it("bounds a century of dates even with thousands of terminal deadlines and no report history",()=>{
    const documents=Array.from({length:2000},(_,index)=>document(String(index),1,50,new Date(Date.UTC(2000,0,1+index*15)).toISOString().slice(0,10)));
    const result=curve({documents,plannedStart:"2000-01-01",plannedEnd:"2100-12-31"});
    expect(result.points.length).toBeLessThanOrEqual(300);expect(result.actualToday).toBe(50);
    expect(result.points.find(point=>point.date==="2000-01-01")).toBeTruthy();
    expect(result.points.find(point=>point.date==="2100-12-31")?.planned).toBe(100);
  });
  it("handles numeric strings, negative/out-of-range credits and non-finite values without NaN",()=>{
    const documents=[{...document("one",1,0,"2026-10-01"),progress_weight:"3",progress_credit:"150"},{...document("two"),progress_weight:"1",progress_credit:"-50"},{...document("invalid"),progress_weight:Infinity,progress_credit:NaN}] as unknown as DeliveryCurveDocument[];
    const result=curve({documents});
    expect(result.actualToday).toBe(75);expect(result.plannedCoverage).toBe(100);
    expect(result.points.every(point=>point.planned===null||Number.isFinite(point.planned))).toBe(true);
  });
  it("handles zero total weight without inventing scope completion or plan coverage",()=>{
    const result=curve({documents:[document("zero",0,100),document("negative",-2,100,null)]});
    expect(result).toMatchObject({hasScope:true,actualToday:0,plannedCoverage:0,plannedToday:null,variance:null,undatedCount:1});
    expect(result.points.every(point=>point.planned===null)).toBe(true);
  });
  it("does not mutate the input document or saved report collections",()=>{
    const documents=[document("one")],reports=[report("one"),report("two","2026-10-01",0)];
    const before=structuredClone({documents,reports});
    curve({documents,reports});
    expect({documents,reports}).toEqual(before);
  });
});
