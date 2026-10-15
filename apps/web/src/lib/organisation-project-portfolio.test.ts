import {describe,expect,it} from "vitest";
import {buildProjectPortfolio,type PortfolioProject,type ProgressRow,type IssueRow} from "./organisation-project-portfolio";

const available={progressAvailable:true,issuesAvailable:true};
function project(id:string,status="active"):PortfolioProject{return {project_id:id,code:`PRJ-${id}`,name:`Project ${id}`,role:"organisation_admin",status};}
function progress(project_id:string,progress_credit=0,progress_weight=1,overdue=false):ProgressRow{return {project_id,progress_credit,progress_weight,overdue};}
function issue(project_id:string,severity="low",status="open"):IssueRow{return {project_id,severity,status};}

describe("organisation project portfolio",()=>{
  it("isolates project aggregates and ignores rows outside the supplied project scope",()=>{
    const projects=[project("one"),project("two")];
    const progressRows=[progress("one",100),progress("two",20),progress("two",60),progress("outside",100,20,true)];
    const issueRows=[issue("one","low"),issue("two","high"),issue("outside","critical")];
    const before=structuredClone({projects,progressRows,issueRows});
    const result=buildProjectPortfolio(projects,progressRows,issueRows,available);
    expect(result.projects.map(item=>item.summary)).toEqual([
      {completion:100,deliverables:1,overdue:0,openIssues:1,health:"Complete"},
      {completion:40,deliverables:2,overdue:0,openIssues:1,health:"Needs attention"},
    ]);
    expect(result.metrics).toEqual({activeProjects:2,averageCompletion:70,attentionProjects:1,openIssues:2});
    expect({projects,progressRows,issueRows}).toEqual(before);
    expect(result.projects[0]).toMatchObject(projects[0]);
  });
  it("preserves weighted credit arithmetic rather than averaging deliverable percentages",()=>{
    const result=buildProjectPortfolio([project("one")],[progress("one",100,1),progress("one",20,3)],[],available);
    expect(result.projects[0].summary.completion).toBe(40);
    expect(result.metrics.averageCompletion).toBe(40);
  });
  it("rounds each project and then averages project completion, without weighting one project by its size",()=>{
    const result=buildProjectPortfolio([project("one"),project("two")],[progress("one",100,20),progress("two",16.6),progress("two",16.6)],[],available);
    expect(result.projects.map(item=>item.summary.completion)).toEqual([100,17]);
    expect(result.metrics.averageCompletion).toBe(59);
  });
  it("limits active portfolio metrics to active projects while retaining archived and trashed cards",()=>{
    const result=buildProjectPortfolio([project("active"),project("archive","archived"),project("trash","trashed"),project("suspended","suspended")],
      [progress("active",40),progress("archive",100),progress("trash",100),progress("suspended",0,1,true)],
      [issue("active"),issue("archive","critical"),issue("trash","high"),issue("suspended","high")],available);
    expect(result.projects).toHaveLength(4);
    expect(result.projects[1].summary.health).toBe("At risk");
    expect(result.projects[2].summary.health).toBe("Needs attention");
    expect(result.metrics).toEqual({activeProjects:1,averageCompletion:40,attentionProjects:0,openIssues:1});
  });
  it("counts only open and monitoring issues, excluding resolved severity from health",()=>{
    const result=buildProjectPortfolio([project("one")],[progress("one",50)],[issue("one","critical","resolved"),issue("one","high","resolved"),issue("one","low","open"),issue("one","medium","monitoring"),issue("one","critical","closed")],available);
    expect(result.projects[0].summary).toMatchObject({openIssues:2,health:"On track"});
    expect(result.metrics.openIssues).toBe(2);
  });
  it.each([
    {rows:[progress("one",20)],issues:[issue("one","critical")],health:"At risk"},
    {rows:[progress("one",20)],issues:[issue("one","high")],health:"Needs attention"},
    {rows:[progress("one",100)],issues:[],health:"Complete"},
    {rows:[progress("one",50)],issues:[],health:"On track"},
    {rows:[],issues:[],health:"Setup required"},
    {rows:[progress("one",50,1,true)],issues:[],health:"Needs attention"},
    {rows:[progress("one",50,1,true),progress("one",50,1,true)],issues:[],health:"At risk"},
  ])("preserves project health assessment: $health",({rows,issues,health})=>{
    const result=buildProjectPortfolio([project("one")],rows,issues,available);
    expect(result.projects[0].summary.health).toBe(health);
    expect(result.metrics.attentionProjects).toBe(health==="At risk"||health==="Needs attention"?1:0);
  });
  it("preserves the material overdue threshold, with equality requiring attention rather than risk",()=>{
    const rows=Array.from({length:10},(_,index)=>progress("one",30,1,index<2));
    expect(buildProjectPortfolio([project("one")],rows,[],available).projects[0].summary.health).toBe("Needs attention");
    rows[2].overdue=true;
    expect(buildProjectPortfolio([project("one")],rows,[],available).projects[0].summary.health).toBe("At risk");
  });
  it("shows a genuine unbaselined project as zero completion and setup required",()=>{
    expect(buildProjectPortfolio([project("one")],[],[],available).projects[0].summary).toEqual({completion:0,deliverables:0,overdue:0,openIssues:0,health:"Setup required"});
  });
  it("returns genuine zero metrics for an empty available portfolio",()=>{
    expect(buildProjectPortfolio([],[],[],available)).toEqual({projects:[],metrics:{activeProjects:0,averageCompletion:0,attentionProjects:0,openIssues:0}});
  });
  it("does not use archived-only projects in an otherwise empty active portfolio",()=>{
    const result=buildProjectPortfolio([project("archived","archived")],[progress("archived",100)],[issue("archived","critical")],available);
    expect(result.metrics).toEqual({activeProjects:0,averageCompletion:0,attentionProjects:0,openIssues:0});
  });
  it("preserves known issue counts but marks progress-dependent metrics unknown when progress fails",()=>{
    const result=buildProjectPortfolio([project("one")],[progress("one",100)],[issue("one","critical")],{progressAvailable:false,issuesAvailable:true});
    expect(result.projects[0].summary).toEqual({completion:null,deliverables:null,overdue:null,openIssues:1,health:null});
    expect(result.metrics).toEqual({activeProjects:1,averageCompletion:null,attentionProjects:null,openIssues:1});
  });
  it("preserves known progress but never calls projects healthy when issue reads fail",()=>{
    const result=buildProjectPortfolio([project("one")],[progress("one",100)],[],{progressAvailable:true,issuesAvailable:false});
    expect(result.projects[0].summary).toEqual({completion:100,deliverables:1,overdue:0,openIssues:null,health:null});
    expect(result.metrics).toEqual({activeProjects:1,averageCompletion:100,attentionProjects:null,openIssues:null});
  });
  it("does not fabricate healthy zero metrics when both sources fail",()=>{
    const result=buildProjectPortfolio([project("one")],[],[],{progressAvailable:false,issuesAvailable:false});
    expect(result.projects[0].summary).toEqual({completion:null,deliverables:null,overdue:null,openIssues:null,health:null});
    expect(result.metrics).toEqual({activeProjects:1,averageCompletion:null,attentionProjects:null,openIssues:null});
  });
  it.each([NaN,Infinity,-Infinity,undefined,null,"","bad",{},[]])("treats invalid progress credit %j as zero without producing NaN or infinite summaries",value=>{
    const row={...progress("one"),progress_credit:value} as ProgressRow;
    const result=buildProjectPortfolio([project("one")],[row],[],available);
    expect(result.projects[0].summary).toMatchObject({completion:0,deliverables:1,health:"On track"});
    expect(result.metrics.averageCompletion).toBe(0);
  });
  it.each([NaN,Infinity,-Infinity,-5,undefined,null,"","bad",{},[]])("ignores invalid or negative progress weight %j",value=>{
    const row={...progress("one",100),progress_weight:value} as ProgressRow;
    expect(buildProjectPortfolio([project("one")],[row,progress("one",20)],[],available).projects[0].summary.completion).toBe(20);
  });
  it("clamps out-of-range credits while preserving numeric strings returned by database numerics",()=>{
    const rows=[{...progress("one"),progress_weight:"3",progress_credit:"150"},{...progress("one"),progress_weight:"1",progress_credit:"-50"}] as unknown as ProgressRow[];
    expect(buildProjectPortfolio([project("one")],rows,[],available).projects[0].summary.completion).toBe(75);
  });
  it("bounds extremely large finite weights so valid input cannot overflow weighted progress",()=>{
    const rows=[progress("one",100,Number.MAX_VALUE),progress("one",0,Number.MAX_VALUE)];
    expect(buildProjectPortfolio([project("one")],rows,[],available).projects[0].summary.completion).toBe(50);
  });
  it("does not count a truthy malformed overdue value as an actual overdue flag",()=>{
    const row={...progress("one",40),overdue:"false"} as unknown as ProgressRow;
    expect(buildProjectPortfolio([project("one")],[row],[],available).projects[0].summary).toMatchObject({overdue:0,health:"On track"});
  });
});
