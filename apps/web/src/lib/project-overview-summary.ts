import {assessProjectHealth,type ProjectHealth} from "./project-health";

export type OverviewProgressRow={progress_weight:number;progress_credit:number;overdue:boolean;uploaded:boolean};
export type OverviewIssue={id:string;title:string;description:string|null;severity:string;status:string;owner_name:string|null;due_date:string|null;created_at:string};
export type OverviewResource={id:string;discipline:string;required_count:number;notes:string|null};
export type OverviewMember={user_id:string;display_name:string;email:string;role:string;disciplines:string[]};

type Availability={progress:boolean;issues:boolean;resources:boolean;team:boolean};
export type ProjectOverviewSummary={completion:number|null;deliverables:number|null;overdue:number|null;openIssues:number|null;engineers:number|null;dcc:number|null;health:ProjectHealth|null;resources:Array<OverviewResource&{assigned:number|null;gap:number|null}>};

function boundedNumber(value:unknown,maximum:number):number{
  if(typeof value!=="number"&&(typeof value!=="string"||!value.trim()))return 0;
  const number=Number(value);
  return Number.isFinite(number)?Math.min(maximum,Math.max(0,number)):0;
}
function disciplineKey(value:string):string{return value.trim().replace(/\s+/g," ").toLowerCase();}

/** Aggregate only the project-scoped rows provided by the authorised caller. */
export function buildProjectOverviewSummary(progress:readonly OverviewProgressRow[],issues:readonly OverviewIssue[],resources:readonly OverviewResource[],members:readonly OverviewMember[],availability:Availability):ProjectOverviewSummary{
  let weight=0,weightedCredit=0,overdue=0,openIssues=0,highIssues=0,criticalIssues=0;
  if(availability.progress){
    for(const row of progress){
      const rowWeight=boundedNumber(row.progress_weight,Number.MAX_SAFE_INTEGER),credit=boundedNumber(row.progress_credit,100);
      weight+=rowWeight;weightedCredit+=rowWeight*credit/100;
      if(row.overdue===true)overdue++;
    }
  }
  if(availability.issues){
    for(const issue of issues){
      if(issue.status!=="open"&&issue.status!=="monitoring")continue;
      openIssues++;
      if(issue.severity==="high")highIssues++;
      if(issue.severity==="critical")criticalIssues++;
    }
  }
  const engineers=new Set<string>(),dcc=new Set<string>(),disciplineEngineers=new Map<string,Set<string>>();
  if(availability.team){
    for(const member of members){
      if(typeof member.user_id!=="string"||!member.user_id.trim())continue;
      const id=member.user_id.trim();
      if(member.role==="document_controller")dcc.add(id);
      if(member.role!=="engineer")continue;
      engineers.add(id);
      for(const discipline of Array.isArray(member.disciplines)?member.disciplines:[]){
        if(typeof discipline!=="string")continue;
        const key=disciplineKey(discipline);
        if(!key)continue;
        const assigned=disciplineEngineers.get(key)??new Set<string>();
        assigned.add(id);disciplineEngineers.set(key,assigned);
      }
    }
  }
  const completion=availability.progress?(weight?Math.max(0,Math.min(100,Math.round(weightedCredit/weight*100))):0):null;
  return {
    completion,
    deliverables:availability.progress?progress.length:null,
    overdue:availability.progress?overdue:null,
    openIssues:availability.issues?openIssues:null,
    engineers:availability.team?engineers.size:null,
    dcc:availability.team?dcc.size:null,
    health:availability.progress&&availability.issues?assessProjectHealth({deliverables:progress.length,completion:completion!,overdue,highIssues,criticalIssues}):null,
    resources:availability.resources?resources.map(resource=>{
      const required_count=Math.floor(boundedNumber(resource.required_count,Number.MAX_SAFE_INTEGER));
      const assigned=availability.team?(disciplineEngineers.get(disciplineKey(resource.discipline))?.size??0):null;
      return {...resource,required_count,assigned,gap:assigned===null?null:Math.max(0,required_count-assigned)};
    }):[],
  };
}
