import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProjectDeliveryCurve} from "./project-delivery-curve";
import type {DeliveryCurveModel,DeliveryCurvePoint} from "@/lib/project-delivery-curve";

// React detects animation-event support before its DOM event module loads.
vi.hoisted(()=>{vi.stubGlobal("AnimationEvent",Event);});
let reduced=false,measuredWidth=640;
const motionListeners=new Set<()=>void>(),observers:MockResizeObserver[]=[];
const fetchData=vi.fn();
class MockResizeObserver implements ResizeObserver{
  disconnected=false;
  constructor(readonly callback:ResizeObserverCallback){observers.push(this);}
  observe(){this.resize(measuredWidth);}
  unobserve(){}
  disconnect(){this.disconnected=true;}
  resize(width:number){this.callback([{contentRect:{width}}] as ResizeObserverEntry[],this);}
}
function point(date:string,submitted:number|null,accepted:number|null,submittedSource:DeliveryCurvePoint["submittedSource"]=null,acceptedSource:DeliveryCurvePoint["acceptedSource"]=null,planned:number|null=null):DeliveryCurvePoint{return {date,planned,submitted,accepted,submittedSource,acceptedSource};}
function model(overrides:Partial<DeliveryCurveModel>={}):DeliveryCurveModel{
  return {points:[point("2026-10-01",null,10,null,"report",0),point("2026-10-05",null,null,null,null,21.1),point("2026-10-10",null,25,null,"report",47.4),point("2026-10-15",65,40,"live","live",73.7),point("2026-10-20",null,null,null,null,100)],
    asOf:"2026-10-15T10:30:00.000Z",submittedToday:65,acceptedToday:40,gap:25,hasScope:true,historyAvailable:true,submittedHistoryCount:0,acceptedHistoryCount:2,invalidHistoryCount:0,
    estimatedPlan:{basis:"timeline_linear_estimate",today:73.7,weeklyRate:36.8,acceptedVariance:-33.7,submittedVariance:-8.7},
    timeline:{plannedStart:"2026-10-01",plannedEnd:"2026-10-20",status:"configured",displayStart:"2026-10-01",displayEnd:"2026-10-20"},...overrides};
}
function workspace(overrides:Partial<DeliveryCurveModel>={}){const curve=model(overrides);return {...render(<ProjectDeliveryCurve curve={curve}/>),curve};}
function datum(label:string){return within(screen.getByRole("status")).getByText(label,{selector:"dt"}).nextElementSibling!;}
function selectedValue(label:string){return datum(label).firstElementChild!.textContent;}
function trace(container:HTMLElement){return container.querySelector<HTMLElement>("[data-curve-traces]")!;}
function path(container:HTMLElement,series:string){return container.querySelector<SVGPathElement>(`path[data-curve-series="${series}"]`);}
function image(){return screen.getByRole("img",{name:"Estimated plan, submitted and DCC-accepted progress S-curve"});}
function axisLabels(){return [...image().querySelectorAll<SVGTextElement>("[data-axis-date]")];}
function preference(value:boolean){act(()=>{reduced=value;motionListeners.forEach(listener=>listener());});}
function showData(){fireEvent.click(screen.getByText("View curve data"));return screen.getByRole("table",{name:"Estimated plan, submitted and DCC-accepted progress data"});}

beforeEach(()=>{
  reduced=false;measuredWidth=640;motionListeners.clear();observers.length=0;fetchData.mockReset();
  const media={get matches(){return reduced;},media:"(prefers-reduced-motion: reduce)",addEventListener:vi.fn((_type:string,listener:()=>void)=>motionListeners.add(listener)),removeEventListener:vi.fn((_type:string,listener:()=>void)=>motionListeners.delete(listener))};
  vi.stubGlobal("matchMedia",vi.fn(()=>media));vi.stubGlobal("ResizeObserver",MockResizeObserver);vi.stubGlobal("PointerEvent",MouseEvent);vi.stubGlobal("fetch",fetchData);
});
afterEach(()=>{expect(fetchData).not.toHaveBeenCalled();cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe("observed submitted and accepted measures",()=>{
  it("keeps the two actual measures and pending acceptance distinct from the estimated plan",()=>{
    const result=workspace();
    expect(screen.getByRole("heading",{name:"Project delivery S-curve"})).toBeTruthy();expect(image().getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Overall submitted",{selector:"span"})).toBeTruthy();expect(screen.getByText("DCC accepted",{selector:"span"})).toBeTruthy();
    expect(selectedValue("Selected date")).toBe("15 Oct 2026");expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");
    expect(datum("Overall submitted").textContent).toContain("Live MDR");expect(datum("DCC accepted").textContent).toContain("Live MDR");
    expect(screen.getByText("Current snapshot: 25 percentage points pending DCC acceptance.")).toBeTruthy();
    expect(trace(result.container).getAttribute("data-animating")).toBe("true");expect(result.container.textContent).not.toMatch(/Calculated plan|Planned final issues|final-issue dates/);
  });
  it("does not copy old accepted reports into an invented submitted trend",()=>{
    const result=workspace();
    expect(path(result.container,"submitted")).toBeNull();expect(result.container.querySelectorAll('[data-curve-series="submitted-point"]')).toHaveLength(1);
    expect(path(result.container,"accepted")!.getAttribute("d")).toBe("M 44 209 L 317.79 177.5 L 469.89 146");
    expect(screen.getByText(/Overall submitted trend will appear when submitted-progress snapshots are available/)).toBeTruthy();
    fireEvent.keyDown(screen.getByRole("slider"),{key:"Home"});expect(selectedValue("Overall submitted")).toBe("Not observed");expect(selectedValue("DCC accepted")).toBe("10%");
    expect(datum("Overall submitted").textContent).not.toContain("Saved report");expect(datum("DCC accepted").textContent).toContain("Saved report");
  });
  it("connects only the independent recorded observations for each line across sparse dates",()=>{
    const values=model();values.points[2]={...values.points[2],submitted:45,submittedSource:"report"};
    const result=workspace({...values,submittedHistoryCount:1});
    expect(path(result.container,"submitted")!.getAttribute("d")).toBe("M 317.79 135.5 L 469.89 93.5");
    expect(path(result.container,"submitted")!.getAttribute("stroke")).toBe("#b94d20");expect(path(result.container,"submitted")!.getAttribute("stroke-dasharray")).toBe("6 6");
    expect(path(result.container,"accepted")!.getAttribute("d")).toBe("M 44 209 L 317.79 177.5 L 469.89 146");expect(path(result.container,"accepted")!.getAttribute("stroke")).toBe("#10243e");
    fireEvent.change(screen.getByRole("slider"),{target:{value:"2"}});expect(selectedValue("Overall submitted")).toBe("45%");expect(selectedValue("DCC accepted")).toBe("25%");
  });
  it("renders current-only observations as single markers without a zero baseline or false trend",()=>{
    const result=workspace({points:[point("2026-10-15",65,40,"live","live")],acceptedHistoryCount:0,timeline:{plannedStart:null,plannedEnd:null,status:"missing",displayStart:"2026-10-15",displayEnd:"2026-10-15"}});
    expect(path(result.container,"submitted")).toBeNull();expect(path(result.container,"accepted")).toBeNull();
    expect(result.container.querySelectorAll('[data-curve-series="submitted-point"]')).toHaveLength(1);expect(result.container.querySelectorAll('[data-curve-series="accepted-point"]')).toHaveLength(1);
    expect(screen.queryByRole("button",{name:"Replay animation"})).toBeNull();expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("DCC-accepted trend will appear as project reports are saved.")).toBeTruthy();expect(selectedValue("DCC accepted")).toBe("40%");
  });
  it("treats unavailable submitted data and a null source as unavailable, not zero or accepted progress",()=>{
    const values=model();values.points[3]={...values.points[3],submitted:65,submittedSource:null};
    const result=workspace({...values,submittedToday:null,gap:null});
    expect(selectedValue("Overall submitted")).toBe("Unavailable");expect(selectedValue("DCC accepted")).toBe("40%");
    expect(screen.getByText("Current pending DCC acceptance: unavailable.")).toBeTruthy();expect(screen.getByText(/Overall submitted progress is unavailable/)).toBeTruthy();
    expect(path(result.container,"submitted")).toBeNull();expect(result.container.querySelector('[data-curve-series="submitted-point"]')).toBeNull();
    expect(datum("Overall submitted").textContent).not.toContain("Live MDR");expect(path(result.container,"accepted")).toBeTruthy();
  });
  it("does not forecast future values or earn 100% at the PM completion date",()=>{
    const values=model();values.points[4]=point("2026-10-20",100,100,"report","report",100);
    const result=workspace(values);
    expect(path(result.container,"accepted")!.getAttribute("d")).not.toContain("622");expect(path(result.container,"submitted")).toBeNull();
    fireEvent.keyDown(screen.getByRole("slider"),{key:"End"});expect(selectedValue("Overall submitted")).toBe("Not observed");expect(selectedValue("DCC accepted")).toBe("Not observed");
    const table=showData(),row=within(table).getByRole("rowheader",{name:"20 Oct 2026"}).closest("tr")!;
    expect(selectedValue("Estimated plan")).toBe("100%");expect(within(row).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["100%","Not observed","Not observed","—","—"]);
  });
  it("keeps genuinely observed zero values as zero",()=>{
    workspace({points:[point("2026-10-15",0,0,"live","live")],submittedToday:0,acceptedToday:0,gap:0});
    expect(selectedValue("Overall submitted")).toBe("0%");expect(selectedValue("DCC accepted")).toBe("0%");expect(screen.getByText("Current snapshot: no submitted-to-accepted progress gap.")).toBeTruthy();
  });
  it("does not silently clamp a negative comparison into a false pending-acceptance claim",()=>{
    workspace({gap:-2.5});expect(screen.getByText("Current snapshot: DCC-accepted progress is 2.5 percentage points above the submitted observation.")).toBeTruthy();
  });
});

describe("timeline-linear estimated plan",()=>{
  it("adds a distinctly labelled slate dashed estimate without changing either observed path",()=>{
    const result=workspace();
    expect(screen.getByText("Estimated plan",{selector:"span"})).toBeTruthy();expect(selectedValue("Estimated plan")).toBe("73.7%");
    const estimate=path(result.container,"planned")!;expect(estimate.getAttribute("stroke")).toBe("#647386");expect(estimate.getAttribute("stroke-dasharray")).toBe("10 4");
    expect(estimate.getAttribute("d")).toMatch(/^M 44 230 .* L 622 20$/);expect(result.container.querySelectorAll('[data-curve-series="planned-point"]')).toHaveLength(5);
    expect(path(result.container,"accepted")!.getAttribute("d")).toBe("M 44 209 L 317.79 177.5 L 469.89 146");expect(path(result.container,"submitted")).toBeNull();
    const original=structuredClone(result.curve);fireEvent.keyDown(screen.getByRole("slider"),{key:"End"});expect(selectedValue("Estimated plan")).toBe("100%");expect(selectedValue("DCC accepted")).toBe("Not observed");expect(result.curve).toEqual(original);
  });
  it("labels weekly plan-only dates as estimates and uses 21.9 percent per week for a 32-day PM timeline",()=>{
    workspace({points:[point("2026-09-07",null,null,null,null,0),point("2026-09-14",null,null,null,null,21.9),point("2026-09-21",null,null,null,null,43.8),point("2026-09-28",null,null,null,null,65.6),point("2026-10-05",null,null,null,null,87.5),point("2026-10-09",null,null,null,null,100),point("2026-10-15",65,40,"live","live",100)],
      estimatedPlan:{basis:"timeline_linear_estimate",today:100,weeklyRate:21.9,acceptedVariance:-60,submittedVariance:-35},
      timeline:{plannedStart:"2026-09-07",plannedEnd:"2026-10-09",status:"configured",displayStart:"2026-09-07",displayEnd:"2026-10-15"}});
    expect(screen.getByText("Linear estimate · approximately 21.9% per week")).toBeTruthy();expect(screen.queryByText(/approximately 25% per week/)).toBeNull();
    fireEvent.change(screen.getByRole("slider"),{target:{value:"1"}});expect(selectedValue("Estimated plan")).toBe("21.9%");expect(selectedValue("Overall submitted")).toBe("Not observed");expect(selectedValue("DCC accepted")).toBe("Not observed");
    const table=showData(),week=within(table).getByRole("rowheader",{name:"14 Sept 2026"}).closest("tr")!;
    expect(within(week).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["21.9%","Not observed","Not observed","—","—"]);
    fireEvent.focus(screen.getByRole("button",{name:"About the project delivery S-curve"}));expect(screen.getByRole("tooltip").textContent).toContain("spreads progress evenly across the Project Manager’s dates");
  });
  it("keeps Today at the live observation when another date is selected",()=>{
    const result=workspace(),marker=image().querySelector('[data-today-marker]')!,label=image().querySelector('[data-today-label]')!;
    const currentX=marker.getAttribute("x1");expect(Number(currentX)).toBeCloseTo(469.894737);expect(label.textContent).toBe("Today");
    expect(result.container.querySelector('[data-curve-series="accepted-point"][data-source="live"]')?.getAttribute("cx")).toBe(currentX);
    fireEvent.keyDown(screen.getByRole("slider"),{key:"Home"});expect(selectedValue("Selected date")).toBe("01 Oct 2026");expect(marker.getAttribute("x1")).toBe(currentX);
    expect(screen.getByText("DCC-accepted progress is 33.7 percentage points behind the estimated plan today.")).toBeTruthy();expect(screen.getByText("Current snapshot: 25 percentage points pending DCC acceptance.")).toBeTruthy();
  });
  it.each([
    [-33.7,"DCC-accepted progress is 33.7 percentage points behind the estimated plan today."],
    [7.5,"DCC-accepted progress is 7.5 percentage points ahead of the estimated plan today."],
    [0,"DCC-accepted progress matches the estimated plan today."],
  ] as const)("describes accepted variance %s separately from pending acceptance",(acceptedVariance,message)=>{
    workspace({estimatedPlan:{...model().estimatedPlan,acceptedVariance}});expect(screen.getByText(message)).toBeTruthy();expect(screen.getByText("Current snapshot: 25 percentage points pending DCC acceptance.")).toBeTruthy();
  });
  it("shows a same-day completion estimate as a single milestone without inventing a weekly rate",()=>{
    const result=workspace({points:[point("2026-10-15",65,40,"live","live",100)],
      estimatedPlan:{basis:"timeline_linear_estimate",today:100,weeklyRate:null,acceptedVariance:-60,submittedVariance:-35},
      timeline:{plannedStart:"2026-10-15",plannedEnd:"2026-10-15",status:"configured",displayStart:"2026-10-15",displayEnd:"2026-10-15"}});
    expect(selectedValue("Estimated plan")).toBe("100%");expect(path(result.container,"planned")).toBeNull();expect(result.container.querySelectorAll('[data-curve-series="planned-point"]')).toHaveLength(1);
    expect(screen.queryByText(/Linear estimate · approximately/)).toBeNull();expect(image().querySelector('[data-today-label]')?.getAttribute("text-anchor")).toBe("middle");expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
  });
  it.each([
    {asOf:"2026-10-01",todayPlan:0,expected:"M 44 230 H 622 V 20",displayStart:"2026-10-01",displayEnd:"2026-10-15"},
    {asOf:"2026-10-20",todayPlan:100,expected:"M 44 20 H 622",displayStart:"2026-10-15",displayEnd:"2026-10-20"},
  ])("draws a same-day milestone without a false early ramp for snapshot $asOf",({asOf,todayPlan,expected,displayStart,displayEnd})=>{
    const points=[point("2026-10-15",null,null,null,null,100),point(asOf,65,40,"live","live",todayPlan)];
    const result=workspace({points,asOf:`${asOf}T10:30:00.000Z`,estimatedPlan:{basis:"timeline_linear_estimate",today:todayPlan,weeklyRate:null,acceptedVariance:40-todayPlan,submittedVariance:65-todayPlan},
      timeline:{plannedStart:"2026-10-15",plannedEnd:"2026-10-15",status:"configured",displayStart,displayEnd}});
    expect(path(result.container,"planned")?.getAttribute("d")).toBe(expected);expect(path(result.container,"accepted")).toBeNull();expect(path(result.container,"submitted")).toBeNull();
    expect(selectedValue("Estimated plan")).toBe(`${todayPlan}%`);expect(selectedValue("DCC accepted")).toBe("40%");expect(screen.queryByText(/Linear estimate · approximately/)).toBeNull();
  });
});

describe("Project Manager timeline context",()=>{
  it("uses PM dates for the axis instead of treating observations as the project duration",()=>{
    workspace({timeline:{plannedStart:"2026-09-01",plannedEnd:"2026-10-31",status:"configured",displayStart:"2026-09-01",displayEnd:"2026-10-31"}});
    expect(screen.getByText("PM timeline · 01 Sept 2026 – 31 Oct 2026")).toBeTruthy();
    expect(axisLabels()[0].textContent).toBe("01 Sept 26");expect(axisLabels().at(-1)!.textContent).toBe("31 Oct 26");
    expect(image().querySelector('[data-pm-completion]')?.getAttribute("x1")).toBe("622");
    expect(selectedValue("Selected date")).toBe("15 Oct 2026");expect(selectedValue("DCC accepted")).toBe("40%");
  });
  it("extends an elapsed timeline to the snapshot, marks the PM end, and leaves dates and values untouched",()=>{
    const values=model();values.points=values.points.filter(value=>value.date<="2026-10-15");
    values.timeline={plannedStart:"2026-10-01",plannedEnd:"2026-10-12",status:"configured",displayStart:"2026-10-01",displayEnd:"2026-10-15"};
    const original=structuredClone(values),result=workspace(values);
    expect(screen.getByText("PM timeline · 01 Oct 2026 – 12 Oct 2026")).toBeTruthy();
    expect(screen.getByText(/The snapshot is after PM planned completion \(12 Oct 2026\)/).textContent).toContain("project dates have not been changed");
    expect(axisLabels().at(-1)!.textContent).toBe("15 Oct 26");
    const shade=result.container.querySelector('[data-curve-period="after-pm-completion"]')!;expect(Number(shade.getAttribute("x"))).toBeCloseTo(498.142857);expect(Number(shade.getAttribute("width"))).toBeCloseTo(123.857143);
    expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");expect(values).toEqual(original);
  });
  it.each(["missing","invalid"] as const)("asks the PM to fix %s dates without inventing a schedule or hiding live progress",status=>{
    const values=model();values.points=values.points.filter(value=>value.date<="2026-10-15");
    const result=workspace({...values,timeline:{plannedStart:status==="missing"?null:"not-a-date",plannedEnd:null,status,displayStart:"2026-10-01",displayEnd:"2026-10-15"}});
    expect(screen.getByText(status==="missing"?/PM timeline is not set\. Ask the Project Manager/:/PM timeline needs correction\. Ask the Project Manager/).textContent).toContain("no project schedule is assumed");
    expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");expect(image().querySelector('[data-pm-completion]')).toBeNull();
    expect(path(result.container,"planned")).toBeNull();expect(selectedValue("Estimated plan")).toBe("Unavailable");expect(screen.queryByText(/Linear estimate · approximately/)).toBeNull();expect(screen.queryByText(/the estimated plan today/)).toBeNull();
  });
  it("explains eligible observations and gap semantics only behind optional help",()=>{
    workspace();expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(screen.getByRole("button",{name:"About the project delivery S-curve"}));
    const text=screen.getByRole("tooltip").textContent!;
    expect(text).toContain("completed submissions awaiting DCC review");expect(text).toContain("accepted progress counts DCC-accepted milestones only");
    expect(text).toContain("stage-weighted, not file counts");expect(text).toContain("actual lines join recorded snapshots only");
    expect(text).toContain("spreads progress evenly across the Project Manager’s dates");expect(text).toContain("not an approved MDR baseline");expect(text).toContain("percentage points, not days of delay");
    expect(text.trim().split(/\s+/).length).toBeLessThanOrEqual(80);
    expect(text).not.toContain("32-day timeline");expect(text).not.toContain("operational deadlines and approvals are not changed");
  });
});

describe("accessible exploration and exact data",()=>{
  it("supports the range, Arrow keys, Home/End and explicit unavailable values",()=>{
    workspace();const slider=screen.getByRole("slider",{name:"Explore curve dates"}) as HTMLInputElement;
    expect(slider.min).toBe("0");expect(slider.max).toBe("4");expect(slider.value).toBe("3");expect(slider.getAttribute("aria-valuetext")).toBe("15 Oct 2026; estimated plan 73.7%; overall submitted 65%; DCC accepted 40%");
    fireEvent.keyDown(slider,{key:"Home"});expect(slider.value).toBe("0");expect(selectedValue("DCC accepted")).toBe("10%");expect(selectedValue("Overall submitted")).toBe("Not observed");
    fireEvent.keyDown(slider,{key:"ArrowRight"});expect(selectedValue("Selected date")).toBe("05 Oct 2026");expect(selectedValue("DCC accepted")).toBe("Not observed");
    fireEvent.keyDown(slider,{key:"End"});expect(slider.value).toBe("4");expect((screen.getByRole("button",{name:"Next curve date"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(slider,{key:"ArrowLeft"});expect(slider.value).toBe("3");fireEvent.change(slider,{target:{value:"2"}});expect(selectedValue("DCC accepted")).toBe("25%");
  });
  it("keeps all read controls individually preview-safe and touch-sized without exempting the parent",()=>{
    workspace();
    for(const label of ["Previous curve date","Next curve date","Replay animation"]){const control=screen.getByRole("button",{name:label});expect(control.getAttribute("type")).toBe("button");expect(control.hasAttribute("data-preview-safe")).toBe(true);expect(control.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");}
    expect(screen.getByRole("button",{name:"Previous curve date"}).className).toContain("size-11");expect(screen.getByRole("slider").hasAttribute("data-preview-safe")).toBe(true);
    expect(screen.getByRole("region",{name:"Project delivery S-curve"}).hasAttribute("data-preview-safe")).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Previous curve date"}));expect(selectedValue("Selected date")).toBe("10 Oct 2026");
    fireEvent.click(screen.getByRole("button",{name:"Next curve date"}));expect(selectedValue("Selected date")).toBe("15 Oct 2026");
  });
  it("selects the nearest real date with touch/pointer input, not an invented axis observation",()=>{
    workspace();const chart=image();vi.spyOn(chart,"getBoundingClientRect").mockReturnValue({left:10,width:640,right:650,top:0,bottom:264,height:264,x:10,y:0,toJSON:()=>({})});
    fireEvent.pointerDown(chart,{clientX:54,clientY:40,pointerType:"touch"});expect(selectedValue("Selected date")).toBe("01 Oct 2026");
    fireEvent.pointerDown(chart,{clientX:632,clientY:40,pointerType:"touch"});expect(selectedValue("Selected date")).toBe("20 Oct 2026");
  });
  it("retains a selected date across refresh and falls back to the latest observation if it disappears",()=>{
    const result=workspace();fireEvent.change(screen.getByRole("slider"),{target:{value:"2"}});
    const next={...result.curve,points:result.curve.points.map(value=>value.date==="2026-10-10"?{...value,accepted:26}:value)};
    result.rerender(<ProjectDeliveryCurve curve={next}/>);expect(selectedValue("DCC accepted")).toBe("26%");
    result.rerender(<ProjectDeliveryCurve curve={{...next,points:next.points.filter(value=>value.date!=="2026-10-10")}}/>);expect(selectedValue("Selected date")).toBe("15 Oct 2026");
  });
  it("offers a captioned exact table with independent submitted/accepted sources and truthful nulls",()=>{
    workspace();const details=screen.getByText("View curve data").closest("details")!;expect(details.open).toBe(false);const table=showData();expect(details.open).toBe(true);
    expect(within(table).getAllByRole("columnheader").map(value=>value.textContent)).toEqual(["Date","Estimated plan","Overall submitted","DCC accepted","Submitted source","Accepted source"]);
    expect(within(table).getAllByRole("columnheader").every(value=>value.getAttribute("scope")==="col")).toBe(true);
    const old=within(table).getByRole("rowheader",{name:"01 Oct 2026"}).closest("tr")!;expect(within(old).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["0%","Not observed","10%","—","Saved report"]);
    const live=within(table).getByRole("rowheader",{name:"15 Oct 2026"}).closest("tr")!;expect(within(live).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["73.7%","65%","40%","Live MDR","Live MDR"]);
    expect(screen.getByRole("region",{name:"S-curve data — scroll horizontally for all columns"}).tabIndex).toBe(0);
  });
  it.each([320,390])("keeps equal-time axis dates readable at %spx despite clustered accepted report dates",width=>{
    measuredWidth=width;const dates=["2026-09-07","2026-09-08","2026-09-09","2026-09-11","2026-09-15","2026-09-18","2026-10-09","2026-10-15"];
    const points=dates.map((date,index)=>point(date,index===7?65:null,index?index*5:null,index===7?"live":null,index===7?"live":index?"report":null));
    const original=structuredClone(points);workspace({points,acceptedToday:35,gap:30,acceptedHistoryCount:6,timeline:{plannedStart:"2026-09-07",plannedEnd:"2026-10-15",status:"configured",displayStart:"2026-09-07",displayEnd:"2026-10-15"}});
    expect(image().querySelector("svg")!.getAttribute("viewBox")).toBe(`0 0 ${width} 228`);
    expect(axisLabels().map(text=>Number(text.getAttribute("x")))).toEqual([44,(44+width-18)/2,width-18]);expect(axisLabels().map(text=>text.textContent)).toEqual(["07 Sept 26","26 Sept 26","15 Oct 26"]);
    expect(axisLabels().map(text=>text.getAttribute("text-anchor"))).toEqual(["start","middle","end"]);expect((screen.getByRole("slider") as HTMLInputElement).max).toBe("7");
    const table=showData();expect(within(table).getAllByRole("rowheader")).toHaveLength(8);expect(within(table).queryByRole("rowheader",{name:"26 Sept 2026"})).toBeNull();expect(points).toEqual(original);
  });
  it("resizes to five desktop domain labels and keeps a singleton date centred",()=>{
    measuredWidth=320;const result=workspace();act(()=>observers[0].resize(900));
    expect(image().querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 900 264");expect(axisLabels()).toHaveLength(5);
    result.rerender(<ProjectDeliveryCurve curve={{...result.curve,points:[point("2026-10-15",65,40,"live","live")],timeline:{plannedStart:null,plannedEnd:null,status:"missing",displayStart:"2026-10-15",displayEnd:"2026-10-15"}}}/>);
    expect(axisLabels()).toHaveLength(1);expect(axisLabels()[0].getAttribute("text-anchor")).toBe("middle");expect(Number(axisLabels()[0].getAttribute("x"))).toBe((44+900-18)/2);
  });
});

describe("one-pass and reduced-motion presentation",()=>{
  it("reveals once without animated counters and replays only after an explicit request",()=>{
    const result=workspace(),first=trace(result.container);expect(first.getAttribute("data-animating")).toBe("true");expect(selectedValue("DCC accepted")).toBe("40%");
    fireEvent.animationEnd(first);expect(trace(result.container).getAttribute("data-animating")).toBe("false");
    const next={...result.curve,acceptedToday:41,points:result.curve.points.map(value=>value.acceptedSource==="live"?{...value,accepted:41}:value)};
    result.rerender(<ProjectDeliveryCurve curve={next}/>);expect(trace(result.container)).toBe(first);expect(trace(result.container).getAttribute("data-animating")).toBe("false");expect(selectedValue("DCC accepted")).toBe("41%");
    fireEvent.click(screen.getByRole("button",{name:"Replay animation"}));expect(trace(result.container)).not.toBe(first);expect(trace(result.container).getAttribute("data-animating")).toBe("true");
    fireEvent.animationEnd(trace(result.container));expect(trace(result.container).getAttribute("data-animating")).toBe("false");
  });
  it("does not animate or allow replay with reduced motion",()=>{
    reduced=true;const result=workspace();expect(trace(result.container).getAttribute("data-animating")).toBe("false");expect((screen.getByRole("button",{name:"Replay animation"}) as HTMLButtonElement).disabled).toBe(true);expect(selectedValue("Overall submitted")).toBe("65%");
  });
  it("cancels when reduced motion changes, then waits for manual replay even if motion is restored",()=>{
    const result=workspace();preference(true);expect(trace(result.container).getAttribute("data-animating")).toBe("false");preference(false);expect(trace(result.container).getAttribute("data-animating")).toBe("false");
    fireEvent.click(screen.getByRole("button",{name:"Replay animation"}));expect(trace(result.container).getAttribute("data-animating")).toBe("true");
  });
  it("cleans up container measurement and motion subscriptions",()=>{
    const result=workspace();expect(motionListeners.size).toBe(1);result.unmount();expect(motionListeners.size).toBe(0);expect(observers[0].disconnected).toBe(true);
  });
});

describe("availability without invented history",()=>{
  it("never displays an empty MDR as a zero-progress curve",()=>{
    workspace({hasScope:false,points:[point("2026-10-15",0,0,"live","live")],submittedToday:0,acceptedToday:0,gap:0});expect(screen.getByText(/Add MDR deliverables to start tracking submitted and DCC-accepted progress/)).toBeTruthy();expect(screen.queryByRole("img")).toBeNull();expect(screen.queryByRole("slider")).toBeNull();
  });
  it("does not claim an empty scope when chart points are unavailable",()=>{
    workspace({points:[]});expect(screen.getByText("The progress curve is unavailable. Refresh progress to try again.")).toBeTruthy();expect(screen.queryByText(/Add MDR deliverables/)).toBeNull();
  });
  it("keeps both live observations when report history fails without retaining unverified report paths",()=>{
    const result=workspace({historyAvailable:false,submittedHistoryCount:0,acceptedHistoryCount:0,invalidHistoryCount:2});
    expect(screen.getByText("Saved report history is unavailable. Current observations are still shown.")).toBeTruthy();expect(screen.getByText("2 saved report snapshots could not be plotted.")).toBeTruthy();
    expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");expect(path(result.container,"accepted")).toBeNull();expect(path(result.container,"submitted")).toBeNull();
  });
  it("does not invent zeroes for invalid percentages or unrecognised observation sources",()=>{
    const values=model();values.points[3]={...values.points[3],submitted:NaN,submittedSource:"live",accepted:40,acceptedSource:null};
    workspace({...values,submittedToday:null,gap:null});
    // The latest recognised observation is the prior accepted report.
    fireEvent.change(screen.getByRole("slider"),{target:{value:"3"}});expect(selectedValue("Overall submitted")).toBe("Unavailable");expect(selectedValue("DCC accepted")).toBe("Unavailable");
  });
});
