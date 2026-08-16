import {describe,expect,it} from "vitest";
import {isProjectSCurveWeeklyDate,progressMovement,projectReportNumber,projectReportSnapshotSchema,projectSCurveCurrentWeekDate,projectSCurveProgress,reportDateInTimezone,reportWeekdayLabel} from "./project-report";

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
    if(result.success){expect(result.data.summary.planned_deliverables).toBe(5);expect(result.data.summary.completed_deliverables).toBe(1);expect(result.data.disciplines[0].completed).toBe(1);expect(result.data.disciplines[0].submitted_to_date).toBe(1);expect(result.data.disciplines[0].issued_this_week).toBe(0);expect(result.data.disciplines[0].weekly_variance).toBe(0);expect(result.data.disciplines[0].actual_completion).toBe(20);expect(result.data.s_curve.overall).toEqual([])}
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
