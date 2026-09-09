import {describe,expect,it} from "vitest";
import {executivePortfolioSchema,executivePortfolioTotals,executiveProjectStatus,type ExecutiveProject} from "./executive-portfolio";
import {can,canInviteProjectRole,invitableProjectRoles} from "./permissions";
import {roleLabel} from "./role-experience";
const project:ExecutiveProject={id:"ef200000-0000-4000-8000-000000000001",code:"P1",name:"Project",status:"active",start_date:null,end_date:null,delivery_stage:"feed",deliverables:10,outstanding:7,overdue:2,open_issues:1,undated:0,progress_percent:40,planned_percent:65,lag_points:25};
describe("executive summaries and capabilities",()=>{
  it("labels the role without granting operational permissions",()=>{
    expect(roleLabel("executive_viewer")).toBe("Executive Viewer");
    for(const capability of ["project:create","members:manage","document:read","document:download","document:write","document:submit_discipline","audit:read","ai:use"] as const)expect(can("executive_viewer",capability)).toBe(false);
    expect(invitableProjectRoles("executive_viewer")).toEqual([]);
    expect(canInviteProjectRole("organisation_admin","executive_viewer")).toBe(false);
  });
  it("never calls missing baselines on track",()=>{
    expect(executiveProjectStatus({...project,deliverables:0})).toBe("Not baselined");
    expect(executiveProjectStatus({...project,overdue:0,planned_percent:null,lag_points:null})).toBe("Dates incomplete");
  });
  it("distinguishes incomplete, lagging and complete projects",()=>{
    expect(executiveProjectStatus(project)).toBe("Behind plan");
    expect(executiveProjectStatus({...project,overdue:0,lag_points:0})).toBe("On track");
    expect(executiveProjectStatus({...project,outstanding:0,progress_percent:100,lag_points:0,overdue:0})).toBe("Complete");
  });
  it("excludes archived and unbaselined projects from average progress",()=>{
    expect(executivePortfolioTotals([project,{...project,status:"archived",progress_percent:100},{...project,deliverables:0,outstanding:0,overdue:0,progress_percent:0}]))
      .toEqual({active:2,average:40,outstanding:7,overdue:2});
    expect(executivePortfolioTotals([])).toEqual({active:0,average:null,outstanding:0,overdue:0});
  });
  it("rejects malformed backend metrics instead of displaying a misleading status",()=>{
    expect(executivePortfolioSchema.safeParse({organisation:{id:project.id,name:"Org",status:"active"},as_of:"2026-09-09",projects:[{...project,progress_percent:101}]}).success).toBe(false);
  });
});
