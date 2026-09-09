import {z} from "zod";

const count=z.number().int().nonnegative();
const percent=z.number().min(0).max(100);
export const executiveProjectSchema=z.object({
  id:z.uuid(),code:z.string(),name:z.string(),status:z.enum(["active","archived"]),
  start_date:z.string().nullable(),end_date:z.string().nullable(),delivery_stage:z.string().nullable(),
  deliverables:count,outstanding:count,overdue:count,open_issues:count,undated:count,
  progress_percent:percent,planned_percent:percent.nullable(),lag_points:percent.nullable(),
});
export const executivePortfolioSchema=z.object({
  organisation:z.object({id:z.uuid(),name:z.string(),status:z.enum(["active","suspended"])}),
  as_of:z.string(),projects:z.array(executiveProjectSchema),
});
export type ExecutivePortfolio=z.infer<typeof executivePortfolioSchema>;
export type ExecutiveProject=z.infer<typeof executiveProjectSchema>;
export function executiveProjectStatus(project:ExecutiveProject){
  if(project.deliverables===0)return "Not baselined";
  if(project.outstanding===0)return "Complete";
  if(project.overdue>0||(project.lag_points??0)>0)return "Behind plan";
  if(project.planned_percent===null)return "Dates incomplete";
  return "On track";
}
export function executivePortfolioTotals(projects:ExecutiveProject[]){
  const active=projects.filter(project=>project.status==="active");
  const baselined=active.filter(project=>project.deliverables>0);
  return {active:active.length,average:baselined.length?Math.round(baselined.reduce((sum,project)=>sum+project.progress_percent,0)/baselined.length):null,
    outstanding:active.reduce((sum,project)=>sum+project.outstanding,0),overdue:active.reduce((sum,project)=>sum+project.overdue,0)};
}
