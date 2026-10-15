import {describe,expect,it} from "vitest";
import {buildProjectOverviewSummary,type OverviewProgressRow,type OverviewIssue,type OverviewResource,type OverviewMember} from "./project-overview-summary";

const available={progress:true,issues:true,resources:true,team:true};
function progress(progress_credit=0,progress_weight=1,overdue=false,uploaded=false):OverviewProgressRow{return {progress_credit,progress_weight,overdue,uploaded};}
function issue(id:string,severity="low",status="open"):OverviewIssue{return {id,title:`Issue ${id}`,description:null,severity,status,owner_name:null,due_date:null,created_at:"2026-10-15T12:00:00Z"};}
function resource(id:string,discipline="Electrical",required_count=2):OverviewResource{return {id,discipline,required_count,notes:null};}
function member(user_id:string,disciplines=["Electrical"],role="engineer"):OverviewMember{return {user_id,display_name:`Member ${user_id}`,email:`${user_id}@example.test`,role,disciplines};}

describe("project overview summary",()=>{
  it("preserves stage-weighted completion, deliverable counts and strict overdue flags",()=>{
    const rows=[progress(100,1,false,true),progress(20,3,true,false)];
    expect(buildProjectOverviewSummary(rows,[],[],[],available)).toEqual({completion:40,deliverables:2,overdue:1,openIssues:0,engineers:0,dcc:0,health:"Needs attention",resources:[]});
  });
  it("does not filter planned deliverables or progress credits by the separate uploaded flag",()=>{
    const result=buildProjectOverviewSummary([progress(50,1,false,false),progress(50,1,false,true)],[],[],[],available);
    expect(result).toMatchObject({completion:50,deliverables:2,health:"On track"});
  });
  it("reports real empty state as zero completion and setup required",()=>{
    expect(buildProjectOverviewSummary([],[],[],[],available)).toEqual({completion:0,deliverables:0,overdue:0,openIssues:0,engineers:0,dcc:0,health:"Setup required",resources:[]});
  });
  it("uses only unresolved controlled issue statuses in counts and health",()=>{
    const result=buildProjectOverviewSummary([progress(40)],[issue("open"),issue("monitoring","medium","monitoring"),issue("resolved","critical","resolved"),issue("unknown","critical","closed")],[],[],available);
    expect(result).toMatchObject({openIssues:2,health:"On track"});
  });
  it.each([
    {rows:[progress(30)],issues:[issue("critical","critical")],health:"At risk"},
    {rows:[progress(30)],issues:[issue("high","high")],health:"Needs attention"},
    {rows:[progress(100)],issues:[],health:"Complete"},
    {rows:[progress(50)],issues:[],health:"On track"},
    {rows:[progress(50,1,true)],issues:[],health:"Needs attention"},
    {rows:[progress(50,1,true),progress(50,1,true)],issues:[],health:"At risk"},
  ])("retains the existing health classification $health",({rows,issues,health})=>{
    expect(buildProjectOverviewSummary(rows,issues,[],[],available).health).toBe(health);
  });
  it("preserves the overdue materiality threshold exactly",()=>{
    const rows=Array.from({length:10},(_,index)=>progress(40,1,index<2));
    expect(buildProjectOverviewSummary(rows,[],[],[],available).health).toBe("Needs attention");
    rows[2].overdue=true;
    expect(buildProjectOverviewSummary(rows,[],[],[],available).health).toBe("At risk");
  });
  it("counts each engineer once, unions duplicate memberships and normalizes discipline whitespace and case",()=>{
    const resources=[resource("electrical"," Electrical ",3),resource("instrumentation","INSTRUMENTATION",1),resource("safety","Technical Safety",2)];
    const members=[member("one",["Electrical"," electrical ","Instrumentation"]),member("one",["Technical   Safety"]),member("two",[" ELECTRICAL "," technical\tSAFETY "]),member("dcc",["Electrical"],"document_controller"),member("pm",["Electrical"],"project_admin")];
    const result=buildProjectOverviewSummary([],[],resources,members,available);
    expect(result.engineers).toBe(2);expect(result.dcc).toBe(1);
    expect(result.resources.map(item=>({id:item.id,assigned:item.assigned,gap:item.gap}))).toEqual([
      {id:"electrical",assigned:2,gap:1},{id:"instrumentation",assigned:1,gap:0},{id:"safety",assigned:2,gap:0},
    ]);
    expect(result.resources[0].discipline).toBe(" Electrical ");
  });
  it("deduplicates document controllers and excludes unrecognized roles from staffing counts",()=>{
    const result=buildProjectOverviewSummary([],[],[],[member("dcc",[],"document_controller"),member("dcc",[],"document_controller"),member("viewer",[],"viewer"),member("admin",[],"organisation_admin"),member("",["Electrical"])],available);
    expect(result).toMatchObject({engineers:0,dcc:1});
  });
  it("keeps an unassigned discipline at zero and never reports negative gaps when over-resourced",()=>{
    const result=buildProjectOverviewSummary([],[],[resource("one","Electrical",1),resource("civil","Civil",2)],[member("one"),member("two")],available);
    expect(result.resources.map(item=>({assigned:item.assigned,gap:item.gap}))).toEqual([{assigned:2,gap:0},{assigned:0,gap:2}]);
  });
  it("does not invent discipline access when team discipline arrays are empty or missing",()=>{
    const members=[member("one",[]),{...member("two"),disciplines:null}] as unknown as OverviewMember[];
    const result=buildProjectOverviewSummary([],[],[resource("one")],members,available);
    expect(result.engineers).toBe(2);
    expect(result.resources[0]).toMatchObject({assigned:0,gap:2});
  });
  it("does not mutate project, issue, resource or member input rows",()=>{
    const rows=[progress(25)],issues=[issue("one")],resources=[{...resource("one"),notes:"Maintain approved team allocation"}],members=[member("one")];
    const before=structuredClone({rows,issues,resources,members});
    const result=buildProjectOverviewSummary(rows,issues,resources,members,available);
    expect({rows,issues,resources,members}).toEqual(before);
    expect(result.resources[0]).not.toBe(resources[0]);
    expect(result.resources[0]).toMatchObject(resources[0]);
  });
  it("retains known issues/team/resources but leaves progress-dependent fields unknown after progress failure",()=>{
    const result=buildProjectOverviewSummary([progress(100)],[issue("one","critical")],[resource("one")],[member("one")],{...available,progress:false});
    expect(result).toMatchObject({completion:null,deliverables:null,overdue:null,openIssues:1,engineers:1,dcc:0,health:null});
    expect(result.resources[0]).toMatchObject({assigned:1,gap:1});
  });
  it("does not label known progress healthy or zero issues when issue reads fail",()=>{
    const result=buildProjectOverviewSummary([progress(100)],[],[],[],{...available,issues:false});
    expect(result).toMatchObject({completion:100,deliverables:1,overdue:0,openIssues:null,engineers:0,dcc:0,health:null});
  });
  it("keeps all team-derived counts and per-discipline readiness unknown after team failure",()=>{
    const result=buildProjectOverviewSummary([progress(30)],[],[resource("one")],[member("one")],{...available,team:false});
    expect(result).toMatchObject({completion:30,engineers:null,dcc:null,health:"On track"});
    expect(result.resources[0]).toMatchObject({required_count:2,assigned:null,gap:null});
  });
  it("returns no resource rows when resource reads are unavailable without hiding known team counts",()=>{
    const result=buildProjectOverviewSummary([],[],[resource("one")],[member("one")],{...available,resources:false});
    expect(result.resources).toEqual([]);expect(result.engineers).toBe(1);expect(result.health).toBe("Setup required");
  });
  it("never fabricates zero or healthy metrics after every source fails",()=>{
    expect(buildProjectOverviewSummary([],[],[],[],{progress:false,issues:false,resources:false,team:false})).toEqual({completion:null,deliverables:null,overdue:null,openIssues:null,engineers:null,dcc:null,health:null,resources:[]});
  });
  it.each([NaN,Infinity,-Infinity,undefined,null,"","bad",{},[]])("neutralizes malformed progress credit %j",value=>{
    const row={...progress(),progress_credit:value} as OverviewProgressRow;
    expect(buildProjectOverviewSummary([row],[],[],[],available).completion).toBe(0);
  });
  it.each([NaN,Infinity,-Infinity,-5,undefined,null,"","bad",{},[]])("does not give progress weight to invalid value %j",value=>{
    const row={...progress(100),progress_weight:value} as OverviewProgressRow;
    expect(buildProjectOverviewSummary([row,progress(20)],[],[],[],available).completion).toBe(20);
  });
  it("handles numeric strings and bounds percentage credits before weighted aggregation",()=>{
    const rows=[{...progress(),progress_weight:"3",progress_credit:"150"},{...progress(),progress_weight:"1",progress_credit:"-50"}] as unknown as OverviewProgressRow[];
    expect(buildProjectOverviewSummary(rows,[],[],[],available).completion).toBe(75);
  });
  it("keeps huge finite weights from overflowing the completion calculation",()=>{
    expect(buildProjectOverviewSummary([progress(100,Number.MAX_VALUE),progress(0,Number.MAX_VALUE)],[],[],[],available).completion).toBe(50);
  });
  it("treats only actual boolean overdue flags as overdue",()=>{
    const rows=[{...progress(50),overdue:"false"}] as unknown as OverviewProgressRow[];
    expect(buildProjectOverviewSummary(rows,[],[],[],available)).toMatchObject({overdue:0,health:"On track"});
  });
  it.each([NaN,Infinity,-Infinity,-3,undefined,null,"","bad"])("normalizes malformed required resource count %j to a safe nonnegative integer",value=>{
    const row={...resource("one"),required_count:value} as OverviewResource;
    expect(buildProjectOverviewSummary([],[],[row],[],available).resources[0]).toMatchObject({required_count:0,assigned:0,gap:0});
  });
  it("normalizes numeric string resource counts without altering notes, ids or labels",()=>{
    const row={id:"resource",discipline:"Electrical",required_count:"3",notes:"Project-approved requirement"} as unknown as OverviewResource;
    expect(buildProjectOverviewSummary([],[],[row],[member("one")],available).resources[0]).toEqual({id:"resource",discipline:"Electrical",required_count:3,notes:"Project-approved requirement",assigned:1,gap:2});
  });
});
