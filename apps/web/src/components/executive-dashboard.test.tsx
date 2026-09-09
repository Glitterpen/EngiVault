import {afterEach,describe,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {ExecutiveDashboard} from "./executive-dashboard";
import type {ExecutivePortfolio} from "@/lib/executive-portfolio";
const refresh=vi.fn();
vi.mock("next/navigation",()=>({useRouter:()=>({refresh})}));
const portfolio:ExecutivePortfolio={organisation:{id:"ef100000-0000-4000-8000-000000000001",name:"Example Engineering",status:"active"},as_of:"2026-09-09T12:00:00Z",projects:[{id:"ef200000-0000-4000-8000-000000000001",code:"FEED-1",name:"Refinery FEED",status:"active",start_date:"2026-09-01",end_date:"2026-12-31",delivery_stage:"feed",deliverables:20,outstanding:10,overdue:2,open_issues:3,undated:0,progress_percent:50,planned_percent:70,lag_points:20}]};
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("minimal executive dashboard",()=>{
  it("shows status, progress, dates, outstanding deliverables and percentage-point lag",()=>{
    render(<ExecutiveDashboard portfolio={portfolio}/>);
    expect(screen.getByRole("heading",{name:"Example Engineering"})).toBeTruthy();
    expect(screen.getByRole("progressbar",{name:"Refinery FEED progress"}).getAttribute("value")).toBe("50");
    expect(screen.getByText("20 pp behind plan")).toBeTruthy();
    expect(screen.getByText("10 / 20")).toBeTruthy();
    expect(screen.getByText(/Start: 1 Sept 2026/)).toBeTruthy();
    expect(screen.getByText(/Planned end: 31 Dec 2026/)).toBeTruthy();
    expect(screen.queryByRole("link",{name:/documents|team|edit|upload|invite/i})).toBeNull();
    expect(screen.queryByRole("button",{name:/edit|upload|invite|delete/i})).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Refresh status"}));
    expect(refresh).toHaveBeenCalledOnce();
  });
  it("keeps explanatory copy behind the help icon",()=>{
    render(<ExecutiveDashboard portfolio={portfolio}/>);
    expect(screen.queryByText(/Lag is the shortfall/)).toBeNull();
    fireEvent.click(screen.getByRole("button",{name:"Executive progress measures"}));
    expect(screen.getByRole("tooltip").textContent).toContain("percentage points, not days");
  });
  it("handles a new organisation with no projects",()=>{
    render(<ExecutiveDashboard portfolio={{...portfolio,projects:[]}}/>);
    expect(screen.getByText(/New projects will appear here automatically/)).toBeTruthy();
    expect(screen.getByText("Not baselined")).toBeTruthy();
  });
});
