import {assessProjectHealth,type ProjectHealth} from "./project-health";

export type PortfolioProject={project_id:string;code:string;name:string;role:string;status:string};
export type ProgressRow={project_id:string;progress_weight:number;progress_credit:number;overdue:boolean};
export type IssueRow={project_id:string;severity:string;status:string};
export type ProjectSummary={completion:number|null;deliverables:number|null;overdue:number|null;openIssues:number|null;health:ProjectHealth|null};

type Availability={progressAvailable:boolean;issuesAvailable:boolean};
type ProjectTotals={weight:number;weightedCredit:number;deliverables:number;overdue:number;openIssues:number;highIssues:number;criticalIssues:number};
type PortfolioMetrics={activeProjects:number;averageCompletion:number|null;attentionProjects:number|null;openIssues:number|null};

function boundedNumber(value:unknown,maximum:number):number{
  // Database numerics can arrive as strings. Blank/null/non-finite or negative
  // values cannot create progress, and a credit cannot exceed 100 percent.
  if(typeof value!=="number"&&(typeof value!=="string"||!value.trim()))return 0;
  const number=Number(value);
  return Number.isFinite(number)?Math.min(maximum,Math.max(0,number)):0;
}

/** Member-scoped rows only; failed source reads stay unknown, never healthy zero. */
export function buildProjectPortfolio(projects:readonly PortfolioProject[],progressRows:readonly ProgressRow[],issueRows:readonly IssueRow[],availability:Availability):{projects:Array<PortfolioProject&{summary:ProjectSummary}>;metrics:PortfolioMetrics}{
  const totals=new Map<string,ProjectTotals>();
  for(const project of projects)totals.set(project.project_id,{weight:0,weightedCredit:0,deliverables:0,overdue:0,openIssues:0,highIssues:0,criticalIssues:0});
  if(availability.progressAvailable){
    for(const row of progressRows){
      const project=totals.get(row.project_id);
      if(!project)continue;
      const weight=boundedNumber(row.progress_weight,Number.MAX_SAFE_INTEGER),credit=boundedNumber(row.progress_credit,100);
      project.weight+=weight;
      project.weightedCredit+=weight*credit/100;
      project.deliverables++;
      if(row.overdue===true)project.overdue++;
    }
  }
  if(availability.issuesAvailable){
    for(const row of issueRows){
      // These are the two unresolved statuses in the controlled project issue
      // workflow. A resolved (or unrecognised) row cannot inflate open counts.
      if(row.status!=="open"&&row.status!=="monitoring")continue;
      const project=totals.get(row.project_id);
      if(!project)continue;
      project.openIssues++;
      if(row.severity==="high")project.highIssues++;
      if(row.severity==="critical")project.criticalIssues++;
    }
  }
  const summaries=projects.map(project=>{
    const total=totals.get(project.project_id)!;
    const completion=availability.progressAvailable?(total.weight?Math.max(0,Math.min(100,Math.round(total.weightedCredit/total.weight*100))):0):null;
    const health=availability.progressAvailable&&availability.issuesAvailable?assessProjectHealth({deliverables:total.deliverables,completion:completion!,overdue:total.overdue,highIssues:total.highIssues,criticalIssues:total.criticalIssues}):null;
    return {...project,summary:{completion,deliverables:availability.progressAvailable?total.deliverables:null,overdue:availability.progressAvailable?total.overdue:null,openIssues:availability.issuesAvailable?total.openIssues:null,health}};
  });
  const active=summaries.filter(project=>project.status==="active");
  return {projects:summaries,metrics:{
    activeProjects:active.length,
    averageCompletion:availability.progressAvailable?(active.length?Math.round(active.reduce((sum,project)=>sum+project.summary.completion!,0)/active.length):0):null,
    attentionProjects:availability.progressAvailable&&availability.issuesAvailable?active.filter(project=>project.summary.health==="At risk"||project.summary.health==="Needs attention").length:null,
    openIssues:availability.issuesAvailable?active.reduce((sum,project)=>sum+project.summary.openIssues!,0):null,
  }};
}
