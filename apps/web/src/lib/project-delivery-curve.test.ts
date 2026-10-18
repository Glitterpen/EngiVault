import {describe,expect,it} from "vitest";
import {buildProjectDeliveryCurve,type DeliveryCurveDocument,type DeliveryCurveReport,type DeliveryCurveSubmissionProgress} from "./project-delivery-curve";

const asOf="2026-10-15T12:00:00Z";
function document(id:string,progress_weight=1,progress_credit=0):DeliveryCurveDocument{return {document_id:id,progress_weight,progress_credit};}
function submissionProgress(overrides:Partial<DeliveryCurveSubmissionProgress>={}):DeliveryCurveSubmissionProgress{
  return {version:1,captured_at:asOf,submitted_progress:91.8,accepted_progress:58.5,total_deliverables:2,total_weight:4,...overrides};
}
function report(id:string,period_end="2026-10-08",accepted:unknown=20,generated_at=period_end+"T16:00:00Z"):DeliveryCurveReport{return {id,period_end,generated_at,snapshot:{summary:{overall_progress:accepted}}};}
function modern(id:string,period_end="2026-10-08",submitted=60,accepted=40):DeliveryCurveReport{
  return {...report(id,period_end,accepted),snapshot:{summary:{overall_progress:accepted},delivery_progress_comparison:{version:1,captured_at:period_end+"T12:00:00Z",submitted_progress:submitted,accepted_progress:accepted,total_deliverables:4,total_weight:4}}};
}
function curve(overrides:Partial<Parameters<typeof buildProjectDeliveryCurve>[0]>={}){
  return buildProjectDeliveryCurve({documents:[document("one",1,33),document("two",3,67)],submissionProgress:submissionProgress(),reports:[],asOf,plannedStart:"2026-10-01",plannedEnd:"2026-12-31",historyAvailable:true,...overrides});
}
function at(result:ReturnType<typeof curve>,date:string){return result.points.find(point=>point.date===date);}

describe("live submitted versus DCC-accepted progress",()=>{
  it("uses the validated management aggregate with matching weighted denominator and integer display rounding",()=>{
    const result=curve();
    expect(result).toMatchObject({asOf:"2026-10-15T12:00:00.000Z",submittedToday:92,acceptedToday:59,gap:33,hasScope:true,submittedHistoryCount:0,acceptedHistoryCount:0,invalidHistoryCount:0,historyAvailable:true});
    expect(at(result,"2026-10-15")).toEqual({date:"2026-10-15",planned:null,submitted:92,accepted:59,submittedSource:"live",acceptedSource:"live"});
    expect(result.timeline).toEqual({plannedStart:"2026-10-01",plannedEnd:"2026-12-31",status:"configured",displayStart:"2026-10-01",displayEnd:"2026-12-31"});
  });
  it("keeps accepted progress row-derived even when the aggregate differs within SQL decimal tolerance",()=>{
    const result=curve({submissionProgress:submissionProgress({accepted_progress:58.4})});
    expect(result).toMatchObject({submittedToday:92,acceptedToday:59,gap:33});
  });
  it("checks accepted consistency against the unrounded weighted percentage, not the UI integer",()=>{
    const result=curve({documents:[document("one",1,47),document("two",2,47.44)],submissionProgress:submissionProgress({accepted_progress:47.3,total_weight:3})});
    expect(result).toMatchObject({submittedToday:92,acceptedToday:47,gap:45});
  });
  it("does not show a negative acceptance gap when decimal tolerance crosses an integer rounding threshold",()=>{
    const result=curve({submissionProgress:submissionProgress({submitted_progress:58.4,accepted_progress:58.4})});
    expect(result).toMatchObject({submittedToday:59,acceptedToday:59,gap:0});
    expect(at(result,"2026-10-15")).toMatchObject({submitted:59,accepted:59});
  });
  it("allows equal submitted and accepted progress with no pending acceptance gap",()=>{
    expect(curve({submissionProgress:submissionProgress({submitted_progress:58.5})})).toMatchObject({submittedToday:59,acceptedToday:59,gap:0});
  });
  it.each([
    {version:2},
    {version:"1"},
    {captured_at:"2026-10-14T23:59:59Z"},
    {captured_at:"2026-10-15T12:00:01Z"},
    {captured_at:"invalid"},
    {captured_at:"2026-02-30T12:00:00Z"},
    {captured_at:"2026-10-15T12:00:00"},
    {submitted_progress:null},
    {submitted_progress:true},
    {submitted_progress:Infinity},
    {submitted_progress:-1},
    {submitted_progress:101},
    {accepted_progress:null},
    {accepted_progress:NaN},
    {accepted_progress:-1},
    {accepted_progress:101},
    {accepted_progress:58.2},
    {accepted_progress:58.8},
    {submitted_progress:58.3,accepted_progress:58.3},
    {submitted_progress:58.5,accepted_progress:58.6},
    {total_deliverables:1},
    {total_deliverables:2.1},
    {total_deliverables:null},
    {total_weight:0},
    {total_weight:4.1},
    {total_weight:Infinity},
    {total_weight:null},
  ])("keeps submitted unavailable for invalid or stale aggregate %#",change=>{
    const result=curve({submissionProgress:{...submissionProgress(),...change} as DeliveryCurveSubmissionProgress});
    expect(result).toMatchObject({submittedToday:null,acceptedToday:59,gap:null});
    expect(at(result,"2026-10-15")).toEqual({date:"2026-10-15",planned:null,submitted:null,accepted:59,submittedSource:null,acceptedSource:"live"});
  });
  it("treats a failed aggregate read as unavailable, not zero or the accepted series",()=>{
    const result=curve({submissionProgress:null});
    expect(result).toMatchObject({submittedToday:null,acceptedToday:59,gap:null});
    expect(at(result,"2026-10-15")).toEqual({date:"2026-10-15",planned:null,submitted:null,accepted:59,submittedSource:null,acceptedSource:"live"});
  });
  it("accepts finite numeric aggregate strings and a UTC-day-equivalent timestamp offset",()=>{
    const aggregate={...submissionProgress(),captured_at:"2026-10-16T00:30:00+14:00",submitted_progress:"91.8",accepted_progress:"58.5",total_deliverables:"2",total_weight:"4"} as unknown as DeliveryCurveSubmissionProgress;
    expect(curve({submissionProgress:aggregate})).toMatchObject({submittedToday:92,acceptedToday:59,gap:33});
  });
  it("allows floating-point sum differences without treating changed scope as matching",()=>{
    const documents=[document("one",0.1,100),document("two",0.2,100)];
    expect(curve({documents,submissionProgress:submissionProgress({submitted_progress:100,accepted_progress:100,total_weight:0.3})})).toMatchObject({submittedToday:100,acceptedToday:100,gap:0});
    expect(curve({documents,submissionProgress:submissionProgress({submitted_progress:100,accepted_progress:100,total_weight:0.31})}).submittedToday).toBeNull();
  });
  it("reports a genuine empty scope as live zero rather than fabricating historical zero baselines",()=>{
    const result=curve({documents:[],submissionProgress:submissionProgress({submitted_progress:0,accepted_progress:0,total_deliverables:0,total_weight:0}),plannedStart:null,plannedEnd:null});
    expect(result).toMatchObject({submittedToday:0,acceptedToday:0,gap:0,hasScope:false});
    expect(result.points).toEqual([{date:"2026-10-15",planned:null,submitted:0,accepted:0,submittedSource:"live",acceptedSource:"live"}]);
  });
  it("does not accept positive aggregate credit against a zero weighted scope",()=>{
    expect(curve({documents:[],submissionProgress:submissionProgress({submitted_progress:10,accepted_progress:0,total_deliverables:0,total_weight:0})})).toMatchObject({submittedToday:null,acceptedToday:0,gap:null});
  });
  it("never reads first/final issue dates or revision cycles as planned progress",()=>{
    const baseline={documents:[document("one",1,33)],submissionProgress:submissionProgress({submitted_progress:67,accepted_progress:33,total_deliverables:1,total_weight:1})};
    const docs=[{...document("one",1,33),planned_submission_date:"2020-01-01",planned_final_date:"2099-12-31",revision_cycle_days:365}];
    const result=curve({...baseline,documents:docs});
    expect(result.points).toEqual(curve(baseline).points);
    expect(result).not.toHaveProperty("planning");expect(result).not.toHaveProperty("plannedToday");
    expect(result).not.toHaveProperty("variance");expect(result).not.toHaveProperty("actualToday");
  });
  it("handles numeric strings, invalid weights and clipped accepted credits without NaN",()=>{
    const documents=[{...document("one"),progress_weight:"3",progress_credit:"150"},{...document("two"),progress_weight:"1",progress_credit:"-50"},{...document("invalid"),progress_weight:Infinity,progress_credit:NaN}] as unknown as DeliveryCurveDocument[];
    expect(curve({documents,submissionProgress:submissionProgress({submitted_progress:75,accepted_progress:75,total_deliverables:3,total_weight:4})})).toMatchObject({submittedToday:75,acceptedToday:75,gap:0});
    expect(curve({documents:[document("one",Number.MAX_VALUE,100),document("two",Number.MAX_VALUE,0)],submissionProgress:null})).toMatchObject({submittedToday:null,acceptedToday:50,gap:null});
    expect(curve({documents:[document("invalid",-1,Infinity)],submissionProgress:null})).toMatchObject({acceptedToday:0});
  });
});

describe("true saved observations, never inferred submitted history",()=>{
  it("uses daily aggregate captures as real observations and never invents an earlier trend",()=>{
    const daily={...modern("daily","2026-10-10",60,40),source_kind:"snapshot" as const};
    const result=curve({reports:[daily]});
    expect(at(result,"2026-10-10")).toMatchObject({planned:null,submitted:60,accepted:40,submittedSource:"snapshot",acceptedSource:"snapshot"});
    expect(at(result,"2026-10-08")).toBeUndefined();
  });
  it("uses legacy report summary only as accepted history",()=>{
    const result=curve({reports:[report("legacy")]});
    expect(at(result,"2026-10-08")).toEqual({date:"2026-10-08",planned:null,submitted:null,accepted:20,submittedSource:null,acceptedSource:"report"});
    expect(result).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:1,invalidHistoryCount:0});
    expect(at(result,"2026-10-01")).toEqual({date:"2026-10-01",planned:null,submitted:null,accepted:null,submittedSource:null,acceptedSource:null});
    expect(at(result,"2026-12-31")).toEqual({date:"2026-12-31",planned:null,submitted:null,accepted:null,submittedSource:null,acceptedSource:null});
  });
  it("uses valid captured submitted/accepted comparison metadata without recalculating history",()=>{
    const saved=modern("modern");
    (saved.snapshot as {summary:{overall_progress:number}}).summary.overall_progress=5;
    const result=curve({reports:[saved]});
    expect(at(result,"2026-10-08")).toEqual({date:"2026-10-08",planned:null,submitted:60,accepted:40,submittedSource:"report",acceptedSource:"report"});
    expect(result).toMatchObject({submittedHistoryCount:1,acceptedHistoryCount:1,invalidHistoryCount:0});
  });
  it("does not invent submitted history when modern metadata omits the required paired accepted progress",()=>{
    const saved={...report("partial","2026-10-08",42),snapshot:{summary:{overall_progress:42},delivery_progress_comparison:{version:1,captured_at:"2026-10-08T12:00:00Z",submitted_progress:60,total_deliverables:1,total_weight:1}}};
    const result=curve({reports:[saved]});
    expect(at(result,"2026-10-08")).toMatchObject({submitted:null,accepted:42});
    expect(result.invalidHistoryCount).toBe(1);
  });
  it("rejects an incomplete submitted-only metadata object without inventing accepted history",()=>{
    const saved={...report("submitted-only"),snapshot:{delivery_progress_comparison:{version:1,captured_at:"2026-10-08T12:00:00Z",submitted_progress:60,total_deliverables:1,total_weight:1}}};
    const result=curve({reports:[saved]});
    expect(at(result,"2026-10-08")).toBeUndefined();
    expect(result).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:0,invalidHistoryCount:1});
  });
  it("keeps real zero observations distinct from missing history",()=>{
    const result=curve({reports:[report("legacy-zero","2026-10-02",0),modern("modern-zero","2026-10-08",0,0)]});
    expect(at(result,"2026-10-02")).toMatchObject({submitted:null,accepted:0,acceptedSource:"report"});
    expect(at(result,"2026-10-08")).toMatchObject({submitted:0,accepted:0,submittedSource:"report",acceptedSource:"report"});
  });
  it("allows a genuine zero-scope captured report with zero total weight",()=>{
    const saved={...modern("empty","2026-10-08",0,0),snapshot:{delivery_progress_comparison:{version:1,captured_at:"2026-10-08T12:00:00Z",submitted_progress:0,accepted_progress:0,total_deliverables:0,total_weight:0}}};
    expect(curve({reports:[saved]})).toMatchObject({submittedHistoryCount:1,acceptedHistoryCount:1,invalidHistoryCount:0});
  });
  it("normalizes UTC capture day before validating that it matches the report cutoff",()=>{
    const saved={...report("offset"),snapshot:{delivery_progress_comparison:{version:1,captured_at:"2026-10-09T00:30:00+02:00",submitted_progress:60,accepted_progress:40,total_deliverables:1,total_weight:1}}};
    expect(curve({reports:[saved]})).toMatchObject({submittedHistoryCount:1,acceptedHistoryCount:1,invalidHistoryCount:0});
  });
  it.each([
    {version:2},
    {version:"1"},
    {captured_at:"2026-10-09T12:00:00Z"},
    {captured_at:"invalid"},
    {captured_at:"2026-02-30T12:00:00Z"},
    {submitted_progress:null},
    {submitted_progress:101},
    {accepted_progress:-1},
    {accepted_progress:61},
    {total_deliverables:1.5},
    {total_deliverables:-1},
    {total_weight:Infinity},
    {total_weight:0},
    {total_deliverables:0,total_weight:1},
  ])("does not backfill malformed modern comparison %# from legacy accepted history",change=>{
    const original=modern("bad").snapshot as {delivery_progress_comparison:Record<string,unknown>};
    const saved={...report("bad"),snapshot:{summary:{overall_progress:20},delivery_progress_comparison:{...original.delivery_progress_comparison,...change}}};
    const result=curve({reports:[saved]});
    expect(at(result,"2026-10-08")).toMatchObject({submitted:null,accepted:20,submittedSource:null,acceptedSource:"report"});
    expect(result).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:1,invalidHistoryCount:1});
  });
  it("accepts finite numeric strings in percentages and capture scope fields",()=>{
    const saved={...report("numeric"),snapshot:{delivery_progress_comparison:{version:1,captured_at:"2026-10-08T12:00:00Z",submitted_progress:"67",accepted_progress:"33",total_deliverables:"4",total_weight:"4.5"}}};
    const result=curve({reports:[saved]});
    expect(at(result,"2026-10-08")).toMatchObject({submitted:67,accepted:33});expect(result.invalidHistoryCount).toBe(0);
  });
  it.each([NaN,Infinity,-Infinity,-1,101,undefined,null,"","bad",true])("rejects invalid legacy accepted percentage %s without inventing either series",value=>{
    const saved={...report("bad"),snapshot:{summary:{overall_progress:value}}};
    expect(curve({reports:[saved]})).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:0,invalidHistoryCount:1});
  });
  it("deduplicates cutoff snapshots by generated time then stable id without mixing captures",()=>{
    const reports=[modern("old","2026-10-08",80,20),report("z","2026-10-08",50,"2026-10-10T12:00:00Z"),report("a","2026-10-08",30,"2026-10-10T12:00:00Z")];
    const first=curve({reports}),second=curve({reports:[...reports].reverse()});
    expect(first.points).toEqual(second.points);
    expect(at(first,"2026-10-08")).toMatchObject({submitted:null,accepted:50});
    expect(first).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:1});
  });
  it("does not let a wholly invalid newer report erase a valid older observation",()=>{
    const result=curve({reports:[report("valid"),report("bad","2026-10-08",300,"2026-10-10T12:00:00Z")]});
    expect(at(result,"2026-10-08")?.accepted).toBe(20);expect(result.invalidHistoryCount).toBe(1);
  });
  it("always uses live values on today's date, never a saved report or a submitted fallback after source failure",()=>{
    const result=curve({reports:[modern("today","2026-10-15",100,100)],submissionProgress:null});
    expect(at(result,"2026-10-15")).toMatchObject({submitted:null,accepted:59,submittedSource:null,acceptedSource:"live"});
    expect(result).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:0});
  });
  it("ignores future cutoffs and reports generated after the as-of time",()=>{
    expect(curve({reports:[report("future","2026-11-01",50,"2026-10-14T12:00:00Z"),report("generated-later","2026-10-08",50,"2026-10-15T12:00:01Z")]})).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:0,invalidHistoryCount:0});
  });
  it("does not use supplied report data if history is unavailable",()=>{
    const result=curve({historyAvailable:false,reports:[modern("valid"),{...report("invalid"),snapshot:null}]});
    expect(result).toMatchObject({historyAvailable:false,submittedHistoryCount:0,acceptedHistoryCount:0,invalidHistoryCount:0,submittedToday:92,acceptedToday:59});
  });
});

const approvedBaseline={
  status:"approved" as const,baseline_id:"81000000-0000-4000-8000-000000000001",baseline_version:1,
  approved_at:"2026-09-30T12:00:00Z",planned_start_date:"2026-10-01",planned_end_date:"2026-12-31",
  scope_hash:"a".repeat(64),total_deliverables:2,total_weight:4,today:58.5,reason:"Approved engineering plan",
  points:[{date:"2026-10-01",planned:0},{date:"2026-10-08",planned:8.25},{date:"2026-10-10",planned:58.5},{date:"2026-12-31",planned:100}],
};
describe("one approved weighted milestone plan",()=>{
  it("never creates a plan merely from PM dates, first issue dates or review cycles",()=>{
    const result=curve();
    expect(result.estimatedPlan).toEqual({basis:"unavailable",today:null,weeklyRate:null,acceptedVariance:null,submittedVariance:null});
    expect(result.points.every(point=>point.planned===null)).toBe(true);
    expect(result).toMatchObject({acceptedToday:59,submittedToday:92,gap:33});
  });
  it("uses exact frozen milestone percentages and holds credit between dated milestones",()=>{
    const result=curve({baseline:approvedBaseline,reports:[report("between","2026-10-09",20)]});
    expect(at(result,"2026-10-08")?.planned).toBe(8.25);
    expect(at(result,"2026-10-09")?.planned).toBe(8.25);
    expect(at(result,"2026-10-10")?.planned).toBe(58.5);
    expect(at(result,"2026-10-15")?.planned).toBe(58.5);
    expect(result.estimatedPlan).toEqual({basis:"approved_weighted_milestones",today:58.5,weeklyRate:null,acceptedVariance:0.5,submittedVariance:33.5});
  });
  it("uses the approved dates even when current PM forecast dates change",()=>{
    const result=curve({baseline:approvedBaseline,plannedStart:"2026-01-01",plannedEnd:"2027-01-01"});
    expect(result.timeline).toMatchObject({plannedStart:"2026-10-01",plannedEnd:"2026-12-31"});
    expect(at(result,"2026-01-01")).toBeUndefined();
  });
  it.each(["missing","scope_changed"] as const)("keeps actual observations when the baseline is %s",status=>{
    const result=curve({baseline:{...approvedBaseline,status,today:null,points:[]},reports:[modern("saved")]});
    expect(result.points.every(point=>point.planned===null)).toBe(true);
    expect(result).toMatchObject({acceptedToday:59,submittedToday:92,acceptedHistoryCount:1,submittedHistoryCount:1});
  });
  it.each([
    {total_deliverables:3},{total_weight:4.5},{approved_at:"2026-10-15T12:00:01Z"},
  ])("refuses a stale/foreign scope or approval made after the snapshot %#",change=>{
    const result=curve({baseline:{...approvedBaseline,...change}});
    expect(result.estimatedPlan.today).toBeNull();
    expect(result.baseline?.status).toBe("scope_changed");
    expect(result.acceptedToday).toBe(59);
  });
  it("fails closed for invalid percentages and descending/duplicate milestone dates",()=>{
    for(const points of [[{date:"2026-10-01",planned:101}],[{date:"2026-10-10",planned:50},{date:"2026-10-08",planned:60}],[{date:"2026-10-10",planned:50},{date:"2026-10-10",planned:60}]]){
      expect(curve({baseline:{...approvedBaseline,points}}).estimatedPlan.today).toBeNull();
    }
  });
  it("never changes current or historic actual values when a plan is approved",()=>{
    const reports=[report("legacy"),modern("modern","2026-10-10",60,40)];
    const without=curve({reports}),withPlan=curve({reports,baseline:approvedBaseline});
    for(const point of without.points.filter(point=>point.accepted!==null||point.submitted!==null)){
      expect(at(withPlan,point.date)).toMatchObject({accepted:point.accepted,submitted:point.submitted,acceptedSource:point.acceptedSource,submittedSource:point.submittedSource});
    }
    expect(withPlan).toMatchObject({acceptedToday:without.acceptedToday,submittedToday:without.submittedToday,gap:without.gap});
  });
  it("retains every baseline breakpoint instead of shifting credit to sampled dates",()=>{
    const points=Array.from({length:400},(_,index)=>({date:new Date(Date.UTC(2025,0,index+1)).toISOString().slice(0,10),planned:Math.round(index/399*10000)/100}));
    const result=curve({baseline:{...approvedBaseline,approved_at:"2024-12-31T12:00:00Z",planned_start_date:points[0].date,planned_end_date:points.at(-1)!.date,points}});
    for(const point of points)expect(at(result,point.date)?.planned).toBe(point.planned);
    expect(result.points.filter(point=>point.acceptedSource==="live")).toHaveLength(1);
  });
  it("retains original dates and actual overrun observations without an invented time-based target",()=>{
    const result=curve({plannedStart:"2026-05-01",plannedEnd:"2026-06-01",reports:[report("overrun","2026-06-10",15)]});
    expect(result.timeline).toEqual({plannedStart:"2026-05-01",plannedEnd:"2026-06-01",status:"configured",displayStart:"2026-05-01",displayEnd:"2026-10-15"});
    expect(at(result,"2026-06-10")).toMatchObject({accepted:15,planned:null});
  });
});

describe("bounded and safe observation model",()=>{
  it("bounds long history to 300 points, preserving project markers, live values and observation endpoints",()=>{
    const reports=Array.from({length:600},(_,index)=>{
      const date=new Date(Date.UTC(2024,0,1+index)).toISOString().slice(0,10);
      return index%2?report(String(index),date,index%101):modern(String(index),date,index%101,index%101);
    });
    const result=curve({reports,plannedStart:"2023-01-01"});
    expect(result.points.length).toBeLessThanOrEqual(300);
    for(const date of ["2023-01-01","2026-10-15","2026-12-31",reports[0].period_end,reports.at(-1)!.period_end])expect(at(result,date)).toBeTruthy();
    expect(result.acceptedHistoryCount).toBe(result.points.filter(point=>point.acceptedSource==="report").length);
    expect(result.submittedHistoryCount).toBe(result.points.filter(point=>point.submittedSource==="report").length);
    expect(result.points.filter(point=>point.acceptedSource==="live")).toHaveLength(1);
    expect(result.points.filter(point=>point.date>"2026-10-15").every(point=>point.submitted===null&&point.accepted===null)).toBe(true);
    expect(new Set(result.points.map(point=>point.date)).size).toBe(result.points.length);
  });
  it("uses UTC date for the authoritative live bucket",()=>{
    const result=curve({asOf:"2026-10-16T00:30:00+02:00"});
    expect(result.asOf).toBe("2026-10-15T22:30:00.000Z");
    expect(result.points.find(point=>point.acceptedSource==="live")?.date).toBe("2026-10-15");
  });
  it.each(["","invalid","1","2026-02-30T12:00:00Z","2026-10-15T12:00:00"])("rejects invalid as-of %s without guessing current time",asOf=>{
    expect(()=>curve({asOf})).toThrow("valid as-of timestamp");
  });
  it("counts invalid past cutoff/generation dates without turning them into a baseline",()=>{
    const result=curve({reports:[report("bad-cutoff","2026-02-30"),report("bad-generated","2026-10-08",20,"invalid")],plannedStart:null,plannedEnd:null});
    expect(result).toMatchObject({invalidHistoryCount:2,submittedHistoryCount:0,acceptedHistoryCount:0});
    expect(result.points).toHaveLength(1);
  });
  it("does not mutate document, aggregate, report or PM date inputs",()=>{
    const documents=[document("one",1,33)],aggregate=submissionProgress({submitted_progress:67,accepted_progress:33,total_deliverables:1,total_weight:1}),reports=[modern("modern"),report("legacy","2026-10-02")];
    const input={documents,submissionProgress:aggregate,reports,asOf,plannedStart:"2026-10-01",plannedEnd:"2026-12-31",historyAvailable:true};
    const before=structuredClone(input);
    buildProjectDeliveryCurve(input);
    expect(input).toEqual(before);
  });
});
