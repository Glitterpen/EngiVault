import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {describe,expect,it} from "vitest";
const root=resolve(process.cwd(),"../..");
const migration=readFileSync(resolve(root,"supabase/migrations/202610180126_shared_baseline_consumers.sql"),"utf8");
const original=readFileSync(resolve(root,"supabase/migrations/202610170114_accepted_milestone_progress.sql"),"utf8");
describe("shared approved-baseline consumer safety",()=>{
  it("has no data rewrite, delete, role grant, function rename or revision mutation",()=>{
    const installation=migration.replace(/create or replace function[\s\S]*?as \$\$[\s\S]*?\$\$;/gi,"");
    expect(installation).not.toMatch(/^\s*(?:update|delete\s+from|insert\s+into|alter\s+function|grant\s)/im);
    expect(migration).not.toMatch(/(?:update|delete\s+from)\s+public\.(?:documents|document_revisions|project_weekly_reports|audit_events)/i);
  });
  it("retains the exact accepted-credit and historical cutoff expressions",()=>{
    for(const formula of [
      "delivery_progress := case when total_weight>0 then round(earned_weight/total_weight*100)::integer else 0 end;",
      "left join lateral public.highest_accepted_document_revision(document.id,(report_end+1)::timestamptz) accepted on true",
      "case when sum(status.progress_weight)>0 then round(sum(status.progress_weight*status.credit/100.0)/sum(status.progress_weight)*100)::integer else 0 end actual_completion",
      "project_actual:=case when metrics.project_weight>0 then round(metrics.project_earned/metrics.project_weight*100)::integer else 0 end;",
      "engineer_actual:=case when metrics.engineer_weight>0 then round(metrics.engineer_earned/metrics.engineer_weight*100)::integer else 0 end;",
    ]){expect(original).toContain(formula);expect(migration).toContain(formula);}
  });
  it("uses the one evaluator for report, engineer, discipline and executive plans",()=>{
    for(const consumer of ["build_project_report_delivery_snapshot","build_project_report_discipline_performance","get_engineer_project_impact","get_executive_portfolio"]){
      const body=migration.match(new RegExp(`create or replace function public\\.${consumer}\\([\\s\\S]*?end(?:\\n| )\\$\\$;`,"i"))?.[0];
      expect(body,consumer).toContain("public.project_milestone_baseline_plan(");
    }
    expect(migration).toContain("current_date,auth.uid(),null");
    expect(migration).toContain("'baseline_planned',curve.planned");
    expect(migration).toContain("'planning_baseline',public.project_baseline_snapshot_metadata(approved_plan)");
  });
  it("never mixes versions within a reporting week's planned terminal count",()=>{
    expect(migration).toContain("weekly_due_count:=terminal_plan-public.project_baseline_terminal_count(approved_plan,report_start-1)");
    expect(migration).toContain("public.project_baseline_terminal_count(baseline.plan,report_start-1)");
    expect(migration).not.toContain("project_milestone_baseline_plan(target_organisation,target_project,report_start-1");
  });
});
