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
    expect(at(result,"2026-10-15")).toEqual({date:"2026-10-15",planned:15.4,submitted:92,accepted:59,submittedSource:"live",acceptedSource:"live"});
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
    expect(at(result,"2026-10-15")).toEqual({date:"2026-10-15",planned:15.4,submitted:null,accepted:59,submittedSource:null,acceptedSource:"live"});
  });
  it("treats a failed aggregate read as unavailable, not zero or the accepted series",()=>{
    const result=curve({submissionProgress:null});
    expect(result).toMatchObject({submittedToday:null,acceptedToday:59,gap:null});
    expect(at(result,"2026-10-15")).toEqual({date:"2026-10-15",planned:15.4,submitted:null,accepted:59,submittedSource:null,acceptedSource:"live"});
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
  it("uses legacy report summary only as accepted history",()=>{
    const result=curve({reports:[report("legacy")]});
    expect(at(result,"2026-10-08")).toEqual({date:"2026-10-08",planned:7.7,submitted:null,accepted:20,submittedSource:null,acceptedSource:"report"});
    expect(result).toMatchObject({submittedHistoryCount:0,acceptedHistoryCount:1,invalidHistoryCount:0});
    expect(at(result,"2026-10-01")).toEqual({date:"2026-10-01",planned:0,submitted:null,accepted:null,submittedSource:null,acceptedSource:null});
    expect(at(result,"2026-12-31")).toEqual({date:"2026-12-31",planned:100,submitted:null,accepted:null,submittedSource:null,acceptedSource:null});
  });
  it("uses valid captured submitted/accepted comparison metadata without recalculating history",()=>{
    const saved=modern("modern");
    (saved.snapshot as {summary:{overall_progress:number}}).summary.overall_progress=5;
    const result=curve({reports:[saved]});
    expect(at(result,"2026-10-08")).toEqual({date:"2026-10-08",planned:7.7,submitted:60,accepted:40,submittedSource:"report",acceptedSource:"report"});
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
    expect(at(result,"2026-10-08")).toMatchObject({planned:7.7,submitted:null,accepted:null,submittedSource:null,acceptedSource:null});
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

describe("PM dates set the estimated plan, never fabricate observed completion",()=>{
  it("retains valid PM endpoints and today without inventing actual zero or completion at them",()=>{
    const result=curve();
    expect(at(result,"2026-10-01")).toEqual({date:"2026-10-01",planned:0,submitted:null,accepted:null,submittedSource:null,acceptedSource:null});
    expect(at(result,"2026-10-15")).toEqual({date:"2026-10-15",planned:15.4,submitted:92,accepted:59,submittedSource:"live",acceptedSource:"live"});
    expect(at(result,"2026-12-31")).toEqual({date:"2026-12-31",planned:100,submitted:null,accepted:null,submittedSource:null,acceptedSource:null});
    expect(result.points.filter(point=>point.submitted!==null||point.accepted!==null)).toHaveLength(1);
  });
  it("extends an overrun display to today without changing the PM's original end date",()=>{
    const result=curve({plannedStart:"2026-05-01",plannedEnd:"2026-06-01",reports:[report("overrun","2026-06-10",15)]});
    expect(result.timeline).toEqual({plannedStart:"2026-05-01",plannedEnd:"2026-06-01",status:"configured",displayStart:"2026-05-01",displayEnd:"2026-10-15"});
    expect(at(result,"2026-06-01")).toMatchObject({submitted:null,accepted:null});
    expect(at(result,"2026-06-10")?.accepted).toBe(15);
  });
  it("does not extend the configured domain to historical observations before PM start or clamp them onto a marker",()=>{
    const result=curve({reports:[report("outside","2026-09-30",100),report("inside","2026-10-08",20)]});
    expect(at(result,"2026-09-30")).toBeUndefined();expect(at(result,"2026-10-01")?.accepted).toBeNull();
    expect(result.acceptedHistoryCount).toBe(1);
  });
  it("includes today before a future PM start but no historical or future fabricated series",()=>{
    const result=curve({plannedStart:"2026-11-01",plannedEnd:"2026-12-31",reports:[report("outside")]});
    expect(result.timeline).toMatchObject({displayStart:"2026-10-15",displayEnd:"2026-12-31",status:"configured"});
    expect(result.acceptedHistoryCount).toBe(0);
    expect(result.points.filter(point=>point.date>"2026-10-15").every(point=>point.submitted===null&&point.accepted===null)).toBe(true);
  });
  it.each([
    {plannedStart:null,plannedEnd:null,status:"missing"},
    {plannedStart:null,plannedEnd:"2026-12-31",status:"missing"},
    {plannedStart:"2026-10-01",plannedEnd:null,status:"missing"},
    {plannedStart:"2026-02-30",plannedEnd:"2026-12-31",status:"invalid"},
    {plannedStart:"2026-11-01",plannedEnd:"2026-10-01",status:"invalid"},
  ] as const)("uses observed date extent when project dates are $status %#",dates=>{
    const result=curve({...dates,reports:[report("observed","2026-09-08",20)]});
    expect(result.timeline).toEqual({...dates,displayStart:"2026-09-08",displayEnd:"2026-10-15"});
    expect(result.points.map(point=>point.date)).toEqual(["2026-09-08","2026-10-15"]);
  });
  it("allows an equal valid start and end date",()=>{
    const result=curve({plannedStart:"2026-10-15",plannedEnd:"2026-10-15"});
    expect(result.timeline).toMatchObject({status:"configured",displayStart:"2026-10-15",displayEnd:"2026-10-15"});
    expect(result.points).toHaveLength(1);
  });
  it("does not invent a prior day when dates and history are missing",()=>{
    const result=curve({plannedStart:null,plannedEnd:null,reports:[]});
    expect(result.timeline).toMatchObject({status:"missing",displayStart:"2026-10-15",displayEnd:"2026-10-15"});
    expect(result.points).toHaveLength(1);
  });
});

describe("calendar-time linear estimated plan",()=>{
  it("spreads 100 percent evenly across the 32-day Sep 7–Oct 9 timeline with a 21.9pp weekly estimate",()=>{
    const date="2026-09-14T12:00:00Z";
    const result=curve({plannedStart:"2026-09-07",plannedEnd:"2026-10-09",asOf:date,submissionProgress:submissionProgress({captured_at:date})});
    expect(result.estimatedPlan).toEqual({basis:"timeline_linear_estimate",today:21.9,weeklyRate:21.9,acceptedVariance:37.1,submittedVariance:70.1});
    expect(result.points.map(point=>[point.date,point.planned])).toEqual([
      ["2026-09-07",0],["2026-09-14",21.9],["2026-09-21",43.8],
      ["2026-09-28",65.6],["2026-10-05",87.5],["2026-10-09",100],
    ]);
    expect(result.points.filter(point=>point.date!=="2026-09-14").every(point=>point.submitted===null&&point.accepted===null&&point.submittedSource===null&&point.acceptedSource===null)).toBe(true);
  });
  it("uses calendar days including weekends, never the working-day revision cycle",()=>{
    const result=curve({plannedStart:"2026-09-11",plannedEnd:"2026-09-14",asOf:"2026-09-12T12:00:00Z",submissionProgress:null,
      documents:[{...document("one",1,33),revision_cycle_days:365,planned_submission_date:"2030-01-01",planned_final_date:"2040-01-01"}]});
    expect(result.estimatedPlan).toEqual({basis:"timeline_linear_estimate",today:33.3,weeklyRate:233.3,acceptedVariance:-0.3,submittedVariance:null});
    expect(at(result,"2026-09-12")?.planned).toBe(33.3);
  });
  it.each([
    {today:"2026-09-01",expected:0},
    {today:"2026-09-07",expected:0},
    {today:"2026-10-09",expected:100},
    {today:"2026-10-15",expected:100},
  ])("clamps the estimate to $expected at $today without changing PM dates",({today,expected})=>{
    const result=curve({plannedStart:"2026-09-07",plannedEnd:"2026-10-09",asOf:today+"T12:00:00Z",submissionProgress:null});
    expect(result.estimatedPlan.today).toBe(expected);
    expect(at(result,today)?.planned).toBe(expected);
    expect(result.timeline).toMatchObject({plannedStart:"2026-09-07",plannedEnd:"2026-10-09"});
    expect(result.acceptedToday).toBe(59);
  });
  it.each([
    {plannedStart:null,plannedEnd:null},
    {plannedStart:null,plannedEnd:"2026-12-31"},
    {plannedStart:"2026-10-01",plannedEnd:null},
    {plannedStart:"2026-02-30",plannedEnd:"2026-12-31"},
    {plannedStart:"2026-12-31",plannedEnd:"2026-10-01"},
    {plannedStart:"2026-10-01",plannedEnd:"not-a-date"},
  ])("does not infer an estimate from MDR data for missing or invalid PM dates %#",dates=>{
    const result=curve({...dates,reports:[report("historic","2026-10-08",20)],documents:[{...document("one",1,33),planned_submission_date:"2026-01-01",planned_final_date:"2026-12-31",revision_cycle_days:3}],submissionProgress:null});
    expect(result.estimatedPlan).toEqual({basis:"timeline_linear_estimate",today:null,weeklyRate:null,acceptedVariance:null,submittedVariance:null});
    expect(result.points.every(point=>point.planned===null)).toBe(true);
    expect(at(result,"2026-10-08")?.accepted).toBe(20);
    expect(result.acceptedToday).toBe(33);
  });
  it.each([
    {today:"2026-10-14",expected:0},
    {today:"2026-10-15",expected:100},
    {today:"2026-10-16",expected:100},
  ])("treats a same-day project as a milestone at $today, without a made-up weekly rate",({today,expected})=>{
    const result=curve({plannedStart:"2026-10-15",plannedEnd:"2026-10-15",asOf:today+"T12:00:00Z",submissionProgress:null});
    expect(result.estimatedPlan).toMatchObject({today:expected,weeklyRate:null,acceptedVariance:59-expected,submittedVariance:null});
    expect(at(result,"2026-10-15")?.planned).toBe(100);
    expect(result.points.every(point=>Number.isFinite(point.planned))).toBe(true);
  });
  it("handles leap days and year boundaries as exact UTC calendar intervals",()=>{
    const leap=curve({plannedStart:"2028-02-28",plannedEnd:"2028-03-01",asOf:"2028-02-29T23:00:00Z",submissionProgress:null});
    expect(leap.estimatedPlan).toMatchObject({today:50,weeklyRate:350});
    const year=curve({plannedStart:"2026-12-28",plannedEnd:"2027-01-11",asOf:"2027-01-04T00:01:00Z",submissionProgress:null});
    expect(year.estimatedPlan).toMatchObject({today:50,weeklyRate:50});
    expect(year.points.map(point=>[point.date,point.planned])).toEqual([["2026-12-28",0],["2027-01-04",50],["2027-01-11",100]]);
  });
  it("retains actual observations and independent sources at coincident estimated dates",()=>{
    const result=curve({reports:[report("legacy","2026-10-08",20),modern("paired","2026-10-10",60,40)]});
    expect(at(result,"2026-10-08")).toMatchObject({planned:7.7,submitted:null,accepted:20,submittedSource:null,acceptedSource:"report"});
    expect(at(result,"2026-10-10")).toMatchObject({planned:9.9,submitted:60,accepted:40,submittedSource:"report",acceptedSource:"report"});
    expect(result).toMatchObject({submittedToday:92,acceptedToday:59,gap:33,submittedHistoryCount:1,acceptedHistoryCount:2});
    expect(result.estimatedPlan).toMatchObject({today:15.4,acceptedVariance:43.6,submittedVariance:76.6});
  });
  it("prioritizes all actual report observations over weekly estimates before sampling to 300 points",()=>{
    const reports=Array.from({length:200},(_,index)=>report(String(index),new Date(Date.UTC(2020,0,index+2)).toISOString().slice(0,10),index%101));
    const result=curve({plannedStart:"2020-01-01",plannedEnd:"2027-01-01",reports});
    expect(result.points).toHaveLength(300);
    expect(result.acceptedHistoryCount).toBe(200);
    for(const saved of reports)expect(at(result,saved.period_end)?.acceptedSource).toBe("report");
    for(const point of result.points.filter(point=>point.acceptedSource===null))expect(point).toMatchObject({submitted:null,accepted:null,submittedSource:null});
    expect(new Set(result.points.map(point=>point.date)).size).toBe(300);
  });
  it("bounds a multi-millennial estimated calendar without truncating its endpoint or fabricating actuals",()=>{
    const result=curve({plannedStart:"0001-01-01",plannedEnd:"9999-12-31",reports:[report("historic","2026-10-08",20)]});
    expect(result.points).toHaveLength(300);
    expect(at(result,"0001-01-01")?.planned).toBe(0);
    expect(at(result,"9999-12-31")).toMatchObject({planned:100,submitted:null,accepted:null});
    expect(result.acceptedHistoryCount).toBe(1);
    expect(result.points.every(point=>point.planned!==null&&Number.isFinite(point.planned)&&point.planned>=0&&point.planned<=100)).toBe(true);
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
