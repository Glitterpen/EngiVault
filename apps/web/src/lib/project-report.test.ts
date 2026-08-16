import {describe,expect,it} from "vitest";
import {disciplineReportColumnsQuery,disciplineReportValue,isProjectSCurveWeeklyDate,progressMovement,projectReportNumber,projectReportSnapshotSchema,projectSCurveCurrentWeekDate,projectSCurveProgress,reportDateInTimezone,reportWeekdayLabel,resolveDisciplineReportColumns} from "./project-report";

describe("project report helpers",()=>{
  it("formats controlled report numbers",()=>expect(projectReportNumber(12)).toBe("PCR-0012"));
  it("labels generation days",()=>expect(reportWeekdayLabel(5)).toBe("Friday"));
  it("distinguishes the first baseline from weekly progress movement",()=>{
    expect(progressMovement(null)).toBe("Baseline");
    expect(progressMovement(4)).toBe("+4%");
    expect(progressMovement(-2)).toBe("-2%");
  });
  it("rejects a report snapshot without controlled progress data",()=>{
    expect(projectReportSnapshotSchema.safeParse({identity:{}}).success).toBe(false);
  });
  it("keeps older report snapshots readable while applying DCC delivery labels",()=>{
    const result=projectReportSnapshotSchema.safeParse({
      identity:{organisation_name:"Example",project_code:"PRJ-1",project_name:"Project",client_name:null,facility_location:null,project_introduction:null,key_objectives:[],planned_start_date:null,planned_end_date:null,client_logo_count:0},
      summary:{overall_progress:20,previous_progress:null,progress_gain:null,total_deliverables:5,uploaded_deliverables:2,approved_deliverables:1,overdue_deliverables:0,weekly_submissions:0,weekly_acceptances:0,weekly_due:0},
      disciplines:[{discipline:"Process",total:5,uploaded:2,approved:1,overdue:0,progress:20,weekly_submissions:0,weekly_acceptances:0}],lookahead:[],challenges:[],
    });
    expect(result.success).toBe(true);
    if(result.success){expect(result.data.identity.delivery_stage).toBe("feed");expect(result.data.identity.terminal_issue_status).toBe("Issued for Design (IFD)");expect(result.data.summary.planned_deliverables).toBe(5);expect(result.data.summary.completed_deliverables).toBe(1);expect(result.data.disciplines[0].completed).toBe(1);expect(result.data.disciplines[0].submitted_to_date).toBe(1);expect(result.data.disciplines[0].issued_this_week).toBe(0);expect(result.data.disciplines[0].weekly_variance).toBe(0);expect(result.data.disciplines[0].actual_completion).toBe(20);expect(result.data.discipline_columns).toHaveLength(8);expect(result.data.weekly_issued_deliverables).toEqual([]);expect(result.data.s_curve.overall).toEqual([])}
  });
  it("calculates the optional discipline percentages from the controlled plan",()=>{
    const parsed=projectReportSnapshotSchema.safeParse({
      identity:{organisation_name:"Example",project_code:"PRJ-1",project_name:"Project",client_name:null,facility_location:null,project_introduction:null,key_objectives:[],planned_start_date:null,planned_end_date:null,client_logo_count:0},
      summary:{overall_progress:20,previous_progress:null,progress_gain:null,total_deliverables:10,uploaded_deliverables:8,approved_deliverables:8,overdue_deliverables:0,weekly_submissions:3,weekly_acceptances:3,weekly_due:4},
      disciplines:[{discipline:"Process",planned:10,completed:8,submitted_to_date:8,planned_this_week:4,issued_this_week:3,weekly_variance:-1,project_variance:-2,planned_completion:100,actual_completion:80,total:10,uploaded:8,approved:8,overdue:0,progress:80,weekly_submissions:3,weekly_acceptances:3}],lookahead:[],challenges:[],
    });
    expect(parsed.success).toBe(true);
    if(parsed.success){const row=parsed.data.disciplines[0];expect(disciplineReportValue(row,"issued_this_week_percent")).toBe("75%");expect(disciplineReportValue(row,"weekly_variance_percent")).toBe("-25%");expect(disciplineReportValue(row,"cumulative_variance_percent")).toBe("-20%")}
  });
  it("validates generated-report column overrides and preserves their PDF query",()=>{
    const columns=resolveDisciplineReportColumns(["planned","weekly_variance_percent","invalid","planned"],["actual_completion"]);
    expect(columns).toEqual(["planned","weekly_variance_percent"]);
    expect(disciplineReportColumnsQuery(columns)).toBe("columns=planned&columns=weekly_variance_percent");
    expect(resolveDisciplineReportColumns([], ["actual_completion"])).toEqual(["actual_completion"]);
  });
  it("uses the project reporting timezone at midnight boundaries",()=>{
    expect(reportDateInTimezone(new Date("2026-08-12T23:30:00Z"))).toBe("2026-08-13");
  });
  it("converts cumulative S-curve counts to percentage progress",()=>{
    expect(projectSCurveProgress({overall:[{date:"2026-08-01",planned:0,completed:0},{date:"2026-08-08",planned:5,completed:3},{date:"2026-08-09",planned:6,completed:4},{date:"2026-08-15",planned:10,completed:null}],disciplines:[]},10)).toEqual([
      {date:"2026-08-01",planned:0,actual:0},
      {date:"2026-08-08",planned:50,actual:30},
      {date:"2026-08-15",planned:100,actual:null},
    ]);
  });
  it("distinguishes weekly S-curve dates from an extra report cut-off date",()=>{
    expect(isProjectSCurveWeeklyDate("2026-08-12","2026-07-29")).toBe(true);
    expect(isProjectSCurveWeeklyDate("2026-08-13","2026-07-29")).toBe(false);
  });
  it("snaps the current-week marker to the latest weekly graph date",()=>{
    expect(projectSCurveCurrentWeekDate(["2026-07-29","2026-08-05","2026-08-12","2026-08-13","2026-08-19"],"2026-08-13")).toBe("2026-08-12");
  });
});
