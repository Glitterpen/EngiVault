import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import {ProjectSCurve} from "@/components/project-s-curve";
import type {ProjectReportSnapshot} from "@/lib/project-report";
vi.mock("@/components/report-scroll-region",()=>({ReportScrollRegion:({children}:{children:React.ReactNode})=><div>{children}</div>}));
const curve:ProjectReportSnapshot["s_curve"]={
  planning_baseline:{version:1,basis:"approved_weighted_milestones",status:"approved",approved_baseline_id:null,approved_baseline_version:1,approved_at:null,scope_hash:null},
  overall:[{date:"2026-09-01",planned:0,baseline_planned:0,completed:0},{date:"2026-09-04",planned:3.3,baseline_planned:3.3,completed:2},{date:"2026-09-08",planned:10,baseline_planned:10,completed:null}],
  disciplines:[{discipline:"Process",planned:10,completed:2,variance:-8,baseline_variance:-1,completion_percent:20}],
};
afterEach(cleanup);
describe("approved report baseline curve",()=>{
  it("draws milestone steps, retains off-week dates and exposes exact values accessibly",()=>{
    const {container}=render(<ProjectSCurve curve={curve} totalDeliverables={10} reportPeriodEnd="2026-09-04"/>);
    const path=container.querySelector('[data-baseline-plan="step"]');
    expect(path?.getAttribute("d")).toMatch(/H .* V .* H .* V /);
    expect(screen.getByRole("img",{name:"Approved weighted milestone plan and accepted actual progress"})).toBeTruthy();
    expect(screen.getByText("2026-09-04")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(screen.getByText("-1")).toBeTruthy();
  });
  it("does not plot compatibility zeros or terminal variance when plan is unavailable",()=>{
    const value={...curve,planning_baseline:{...curve.planning_baseline!,status:"missing" as const},disciplines:curve.disciplines.map(row=>({...row,baseline_variance:null}))};
    const {container}=render(<ProjectSCurve curve={value} totalDeliverables={10} reportPeriodEnd="2026-09-04"/>);
    expect(container.querySelector('[data-baseline-plan="step"]')).toBeNull();
    expect(screen.getByText("Approved plan unavailable")).toBeTruthy();
    expect(container.querySelector("polyline")).not.toBeNull();
    expect(screen.getAllByText("N/A").length).toBeGreaterThan(0);
  });
});
