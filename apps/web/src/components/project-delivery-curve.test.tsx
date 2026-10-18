import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProjectDeliveryCurve} from "./project-delivery-curve";
import type {DeliveryCurveModel,DeliveryCurvePoint} from "@/lib/project-delivery-curve";

let measuredWidth=640;
const observers:MockResizeObserver[]=[];
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
    estimatedPlan:{basis:"approved_weighted_milestones",today:73.7,weeklyRate:null,acceptedVariance:-33.7,submittedVariance:-8.7},
    timeline:{plannedStart:"2026-10-01",plannedEnd:"2026-10-20",status:"configured",displayStart:"2026-10-01",displayEnd:"2026-10-20"},...overrides};
}
function workspace(overrides:Partial<DeliveryCurveModel>={}){const curve=model(overrides);return {...render(<ProjectDeliveryCurve curve={curve}/>),curve};}
function datum(label:string){return within(screen.getByRole("status")).getByText(label,{selector:"dt"}).nextElementSibling!;}
function selectedValue(label:string){return datum(label).firstElementChild!.textContent;}
function trace(container:HTMLElement){return container.querySelector<HTMLElement>("[data-curve-traces]")!;}
function path(container:HTMLElement,series:string){return container.querySelector<SVGPathElement>(`path[data-curve-series="${series}"]`);}
function currentMarker(container:HTMLElement){return container.querySelector<HTMLElement>("[data-curve-current-marker]");}
function traveller(container:HTMLElement){return container.querySelector<HTMLElement>("[data-curve-traveller]");}
function image(){return screen.getByRole("img",{name:"Approved plan, submitted and DCC-accepted progress S-curve"});}
function axisLabels(){return [...image().querySelectorAll<SVGTextElement>("[data-axis-date]")];}
function showData(){return screen.getByRole("table",{name:"Approved plan, submitted and DCC-accepted progress data"});}
function selectDate(index:number){fireEvent.keyDown(image(),{key:"Home"});for(let next=0;next<index;next++)fireEvent.keyDown(image(),{key:"ArrowRight"});}

beforeEach(()=>{
  measuredWidth=640;observers.length=0;fetchData.mockReset();
  vi.stubGlobal("ResizeObserver",MockResizeObserver);vi.stubGlobal("PointerEvent",MouseEvent);vi.stubGlobal("fetch",fetchData);
});
afterEach(()=>{expect(fetchData).not.toHaveBeenCalled();cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe("minimal chart presentation",()=>{
  it("shows only the chart and three legends without persistent explanatory sections or controls",()=>{
    const {container}=workspace(),heading=screen.getByRole("heading",{name:"Project delivery S-curve"});
    expect(heading.className).toContain("sr-only");
    for(const legend of ["Approved plan","Overall submitted","DCC accepted"])expect(screen.getByText(legend,{selector:"span"})).toBeTruthy();
    expect(container.querySelector("header")).toBeNull();expect(container.querySelector("figcaption")?.className).toContain("sr-only");expect(container.querySelector("details")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();expect(screen.queryByRole("slider")).toBeNull();expect(container.querySelector("[data-curve-inspection]")).toBeNull();
    expect(container.textContent).not.toMatch(/PM timeline ·|Live snapshot ·|Linear estimate ·|Current snapshot:|View curve data|Explore curve dates/);
    expect(screen.getByText("Below plan").className).toContain("sr-only");
    expect(container.querySelector("[data-curve-selected]")?.className).toContain("sr-only");
  });
  it("reveals a numeric inspection tooltip on focus and hides it on blur",()=>{
    const {container}=workspace(),chart=image();expect(container.querySelector("[data-curve-inspection]")).toBeNull();
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("off");
    fireEvent.focus(chart);
    const tooltip=container.querySelector("[data-curve-inspection]")!;expect(tooltip.getAttribute("aria-hidden")).toBe("true");
    expect(tooltip.textContent).toContain("15 Oct 2026");expect(tooltip.textContent).toContain("73.7%");expect(tooltip.textContent).toContain("65%");expect(tooltip.textContent).toContain("40%");
    expect(chart.getAttribute("data-inspecting")).toBe("true");expect(screen.getByRole("status").getAttribute("aria-live")).toBe("polite");fireEvent.blur(chart);
    expect(container.querySelector("[data-curve-inspection]")).toBeNull();expect(chart.getAttribute("data-inspecting")).toBe("false");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("off");
  });
  it("uses pointer inspection only while interacting and preserves exact real-date values",()=>{
    const {container}=workspace(),chart=image();vi.spyOn(chart,"getBoundingClientRect").mockReturnValue({left:10,width:640,right:650,top:0,bottom:264,height:264,x:10,y:0,toJSON:()=>({})});
    fireEvent.pointerMove(chart,{clientX:54,clientY:40,pointerType:"mouse"});
    expect(selectedValue("Selected date")).toBe("01 Oct 2026");expect(container.querySelector("[data-curve-inspection]")?.textContent).toContain("10%");
    fireEvent.pointerLeave(chart);expect(container.querySelector("[data-curve-inspection]")).toBeNull();
    fireEvent.pointerDown(chart,{clientX:632,clientY:40,pointerType:"touch"});expect(container.querySelector("[data-curve-inspection]")?.textContent).toContain("20 Oct 2026");
  });
  it("dismisses the inspection with Escape without resetting the selected date or current progress",()=>{
    const {container}=workspace(),chart=image();fireEvent.focus(chart);fireEvent.keyDown(chart,{key:"Home"});
    expect(selectedValue("Selected date")).toBe("01 Oct 2026");expect(container.querySelector("[data-curve-inspection]")).toBeTruthy();
    fireEvent.keyDown(chart,{key:"Escape"});expect(container.querySelector("[data-curve-inspection]")).toBeNull();
    expect(selectedValue("Selected date")).toBe("01 Oct 2026");expect(currentMarker(container)?.dataset.value).toBe("40");
    expect(screen.getByRole("status").getAttribute("aria-live")).toBe("off");
    fireEvent.keyDown(chart,{key:"ArrowRight"});expect(container.querySelector("[data-curve-inspection]")).toBeTruthy();expect(selectedValue("Selected date")).toBe("05 Oct 2026");
  });
});

describe("observed submitted and accepted measures",()=>{
  it("keeps the two actual measures and pending acceptance distinct from the approved plan",()=>{
    const result=workspace();
    expect(screen.getByRole("heading",{name:"Project delivery S-curve"})).toBeTruthy();expect(image().getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Overall submitted",{selector:"span"})).toBeTruthy();expect(screen.getByText("DCC accepted",{selector:"span"})).toBeTruthy();
    expect(selectedValue("Selected date")).toBe("15 Oct 2026");expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");
    expect(datum("Overall submitted").textContent).toContain("Live MDR");expect(datum("DCC accepted").textContent).toContain("Live MDR");
    expect(screen.queryByText("Current snapshot: 25 percentage points pending DCC acceptance.")).toBeNull();
    expect(trace(result.container).getAttribute("data-progress-status")).toBe("behind");expect(result.container.textContent).not.toMatch(/Calculated plan|Planned final issues|final-issue dates/);
  });
  it("does not copy old accepted reports into an invented submitted trend",()=>{
    const result=workspace();
    expect(path(result.container,"submitted")).toBeNull();expect(result.container.querySelectorAll('[data-curve-series="submitted-point"]')).toHaveLength(1);
    expect(path(result.container,"accepted")!.getAttribute("d")).toBe("M 44 209 L 317.79 177.5 L 469.89 146");
    fireEvent.keyDown(image(),{key:"Home"});expect(selectedValue("Overall submitted")).toBe("Not observed");expect(selectedValue("DCC accepted")).toBe("10%");
    expect(datum("Overall submitted").textContent).not.toContain("Saved report");expect(datum("DCC accepted").textContent).toContain("Saved report");
  });
  it("connects only the independent recorded observations for each line across sparse dates",()=>{
    const values=model();values.points[2]={...values.points[2],submitted:45,submittedSource:"report"};
    const result=workspace({...values,submittedHistoryCount:1});
    expect(path(result.container,"submitted")!.getAttribute("d")).toBe("M 317.79 135.5 L 469.89 93.5");
    expect(path(result.container,"submitted")!.getAttribute("stroke")).toBe("#b94d20");expect(path(result.container,"submitted")!.getAttribute("stroke-dasharray")).toBe("6 6");
    expect(path(result.container,"accepted")!.getAttribute("d")).toBe("M 44 209 L 317.79 177.5 L 469.89 146");expect(path(result.container,"accepted")!.getAttribute("stroke")).toBe("#b91c1c");
    selectDate(2);expect(selectedValue("Overall submitted")).toBe("45%");expect(selectedValue("DCC accepted")).toBe("25%");
  });
  it("renders current-only observations as single markers without a zero baseline or false trend",()=>{
    const result=workspace({points:[point("2026-10-15",65,40,"live","live")],acceptedHistoryCount:0,timeline:{plannedStart:null,plannedEnd:null,status:"missing",displayStart:"2026-10-15",displayEnd:"2026-10-15"}});
    expect(path(result.container,"submitted")).toBeNull();expect(path(result.container,"accepted")).toBeNull();
    expect(result.container.querySelectorAll('[data-curve-series="submitted-point"]')).toHaveLength(1);expect(result.container.querySelectorAll('[data-curve-series="accepted-point"]')).toHaveLength(1);
    expect(screen.queryByRole("button",{name:"Replay animation"})).toBeNull();expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.keyDown(image(),{key:"ArrowRight"});expect(selectedValue("DCC accepted")).toBe("40%");
  });
  it("treats unavailable submitted data and a null source as unavailable, not zero or accepted progress",()=>{
    const values=model();values.points[3]={...values.points[3],submitted:65,submittedSource:null};
    const result=workspace({...values,submittedToday:null,gap:null});
    expect(selectedValue("Overall submitted")).toBe("Unavailable");expect(selectedValue("DCC accepted")).toBe("40%");
    expect(screen.queryByText("Current pending DCC acceptance: unavailable.")).toBeNull();
    expect(path(result.container,"submitted")).toBeNull();expect(result.container.querySelector('[data-curve-series="submitted-point"]')).toBeNull();
    expect(datum("Overall submitted").textContent).not.toContain("Live MDR");expect(path(result.container,"accepted")).toBeTruthy();
  });
  it("does not forecast future values or earn 100% at the PM completion date",()=>{
    const values=model();values.points[4]=point("2026-10-20",100,100,"report","report",100);
    const result=workspace(values);
    expect(path(result.container,"accepted")!.getAttribute("d")).not.toContain("622");expect(path(result.container,"submitted")).toBeNull();
    fireEvent.keyDown(image(),{key:"End"});expect(selectedValue("Overall submitted")).toBe("Not observed");expect(selectedValue("DCC accepted")).toBe("Not observed");
    const table=showData(),row=within(table).getByRole("rowheader",{name:"20 Oct 2026"}).closest("tr")!;
    expect(selectedValue("Approved plan")).toBe("100%");expect(within(row).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["100%","Not observed","Not observed","—","—"]);
  });
  it("keeps genuinely observed zero values as zero",()=>{
    workspace({points:[point("2026-10-15",0,0,"live","live")],submittedToday:0,acceptedToday:0,gap:0});
    expect(selectedValue("Overall submitted")).toBe("0%");expect(selectedValue("DCC accepted")).toBe("0%");
  });
  it("does not turn a negative gap into a visible pending-acceptance claim",()=>{
    const result=workspace({gap:-2.5});expect(result.container.textContent).not.toMatch(/Current snapshot:|pending DCC acceptance\./);expect(result.curve.gap).toBe(-2.5);
  });
});

describe("approved weighted milestone plan",()=>{
  it("adds a distinctly labelled slate dashed estimate without changing either observed path",()=>{
    const result=workspace();
    expect(screen.getByText("Approved plan",{selector:"span"})).toBeTruthy();expect(selectedValue("Approved plan")).toBe("73.7%");
    const estimate=path(result.container,"planned")!;expect(estimate.getAttribute("stroke")).toBe("#647386");expect(estimate.getAttribute("stroke-dasharray")).toBe("10 4");
    expect(estimate.getAttribute("d")).toMatch(/^M 44 230 H .* H 622 V 20$/);expect(result.container.querySelectorAll('[data-curve-series="planned-point"]')).toHaveLength(5);
    expect(path(result.container,"accepted")!.getAttribute("d")).toBe("M 44 209 L 317.79 177.5 L 469.89 146");expect(path(result.container,"submitted")).toBeNull();
    const original=structuredClone(result.curve);fireEvent.keyDown(image(),{key:"End"});expect(selectedValue("Approved plan")).toBe("100%");expect(selectedValue("DCC accepted")).toBe("Not observed");expect(result.curve).toEqual(original);
  });
  it("preserves exact weekly plan estimates without displaying explanatory copy",()=>{
    workspace({points:[point("2026-09-07",null,null,null,null,0),point("2026-09-14",null,null,null,null,21.9),point("2026-09-21",null,null,null,null,43.8),point("2026-09-28",null,null,null,null,65.6),point("2026-10-05",null,null,null,null,87.5),point("2026-10-09",null,null,null,null,100),point("2026-10-15",65,40,"live","live",100)],
      estimatedPlan:{basis:"approved_weighted_milestones",today:100,weeklyRate:null,acceptedVariance:-60,submittedVariance:-35},
      timeline:{plannedStart:"2026-09-07",plannedEnd:"2026-10-09",status:"configured",displayStart:"2026-09-07",displayEnd:"2026-10-15"}});
    expect(screen.queryByText(/Linear estimate · approximately/)).toBeNull();
    selectDate(1);expect(selectedValue("Approved plan")).toBe("21.9%");expect(selectedValue("Overall submitted")).toBe("Not observed");expect(selectedValue("DCC accepted")).toBe("Not observed");
    const table=showData(),week=within(table).getByRole("rowheader",{name:"14 Sept 2026"}).closest("tr")!;
    expect(within(week).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["21.9%","Not observed","Not observed","—","—"]);
    expect(screen.queryByRole("button",{name:"About the project delivery S-curve"})).toBeNull();
  });
  it("keeps Today at the live observation when another date is selected",()=>{
    const result=workspace(),marker=image().querySelector('[data-today-marker]')!,label=image().querySelector('[data-today-label]')!;
    const currentX=marker.getAttribute("x1");expect(Number(currentX)).toBeCloseTo(469.894737);expect(label.textContent).toBe("Today");
    expect(result.container.querySelector('[data-curve-series="accepted-point"][data-source="live"]')?.getAttribute("cx")).toBe(currentX);
    fireEvent.keyDown(image(),{key:"Home"});expect(selectedValue("Selected date")).toBe("01 Oct 2026");expect(marker.getAttribute("x1")).toBe(currentX);
  });
  it.each([-33.7,7.5,0])("preserves accepted variance %s without adding visible narrative",acceptedVariance=>{
    const result=workspace({estimatedPlan:{...model().estimatedPlan,acceptedVariance}});expect(result.curve.estimatedPlan.acceptedVariance).toBe(acceptedVariance);expect(result.container.textContent).not.toMatch(/DCC-accepted progress (is|matches)|Current snapshot:/);
  });
  it("shows a same-day completion estimate as a single milestone without inventing a weekly rate",()=>{
    const result=workspace({points:[point("2026-10-15",65,40,"live","live",100)],
      estimatedPlan:{basis:"approved_weighted_milestones",today:100,weeklyRate:null,acceptedVariance:-60,submittedVariance:-35},
      timeline:{plannedStart:"2026-10-15",plannedEnd:"2026-10-15",status:"configured",displayStart:"2026-10-15",displayEnd:"2026-10-15"}});
    expect(selectedValue("Approved plan")).toBe("100%");expect(path(result.container,"planned")).toBeNull();expect(result.container.querySelectorAll('[data-curve-series="planned-point"]')).toHaveLength(1);
    expect(screen.queryByText(/Linear estimate · approximately/)).toBeNull();expect(image().querySelector('[data-today-label]')?.getAttribute("text-anchor")).toBe("middle");expect(screen.queryByRole("slider")).toBeNull();
  });
  it.each([
    {asOf:"2026-10-01",todayPlan:0,expected:"M 44 230 H 622 V 20",displayStart:"2026-10-01",displayEnd:"2026-10-15"},
    {asOf:"2026-10-20",todayPlan:100,expected:"M 44 20 H 622",displayStart:"2026-10-15",displayEnd:"2026-10-20"},
  ])("draws a same-day milestone without a false early ramp for snapshot $asOf",({asOf,todayPlan,expected,displayStart,displayEnd})=>{
    const points=[point("2026-10-15",null,null,null,null,100),point(asOf,65,40,"live","live",todayPlan)];
    const result=workspace({points,asOf:`${asOf}T10:30:00.000Z`,estimatedPlan:{basis:"approved_weighted_milestones",today:todayPlan,weeklyRate:null,acceptedVariance:40-todayPlan,submittedVariance:65-todayPlan},
      timeline:{plannedStart:"2026-10-15",plannedEnd:"2026-10-15",status:"configured",displayStart,displayEnd}});
    expect(path(result.container,"planned")?.getAttribute("d")).toBe(expected);expect(path(result.container,"accepted")).toBeNull();expect(path(result.container,"submitted")).toBeNull();
    expect(selectedValue("Approved plan")).toBe(`${todayPlan}%`);expect(selectedValue("DCC accepted")).toBe("40%");expect(screen.queryByText(/Linear estimate · approximately/)).toBeNull();
  });
});

describe("Project Manager timeline context",()=>{
  it("uses PM dates for the axis instead of treating observations as the project duration",()=>{
    workspace({timeline:{plannedStart:"2026-09-01",plannedEnd:"2026-10-31",status:"configured",displayStart:"2026-09-01",displayEnd:"2026-10-31"}});
    expect(screen.queryByText("PM timeline · 01 Sept 2026 – 31 Oct 2026")).toBeNull();
    expect(axisLabels()[0].textContent).toBe("01 Sept 26");expect(axisLabels().at(-1)!.textContent).toBe("31 Oct 26");
    expect(image().querySelector('[data-pm-completion]')?.getAttribute("x1")).toBe("622");
    expect(selectedValue("Selected date")).toBe("15 Oct 2026");expect(selectedValue("DCC accepted")).toBe("40%");
  });
  it("extends an elapsed timeline to the snapshot, marks the PM end, and leaves dates and values untouched",()=>{
    const values=model();values.points=values.points.filter(value=>value.date<="2026-10-15");
    values.timeline={plannedStart:"2026-10-01",plannedEnd:"2026-10-12",status:"configured",displayStart:"2026-10-01",displayEnd:"2026-10-15"};
    const original=structuredClone(values),result=workspace(values);
    expect(screen.queryByText("PM timeline · 01 Oct 2026 – 12 Oct 2026")).toBeNull();
    expect(screen.queryByText(/The snapshot is after PM planned completion/)).toBeNull();
    expect(axisLabels().at(-1)!.textContent).toBe("15 Oct 26");
    const shade=result.container.querySelector('[data-curve-period="after-pm-completion"]')!;expect(Number(shade.getAttribute("x"))).toBeCloseTo(498.142857);expect(Number(shade.getAttribute("width"))).toBeCloseTo(123.857143);
    expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");expect(values).toEqual(original);
  });
  it.each(["missing","invalid"] as const)("keeps %s timeline comparison unavailable without inventing a schedule or hiding live progress",status=>{
    const values=model();values.points=values.points.filter(value=>value.date<="2026-10-15");
    const result=workspace({...values,timeline:{plannedStart:status==="missing"?null:"not-a-date",plannedEnd:null,status,displayStart:"2026-10-01",displayEnd:"2026-10-15"}});
    expect(screen.queryByText(/PM timeline is not set|PM timeline needs correction/)).toBeNull();
    expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");expect(image().querySelector('[data-pm-completion]')).toBeNull();
    expect(path(result.container,"planned")).toBeNull();expect(selectedValue("Approved plan")).toBe("Unavailable");expect(screen.queryByText(/Linear estimate · approximately/)).toBeNull();expect(screen.queryByText(/the approved plan today/)).toBeNull();
  });
  it("keeps truthful series semantics in a screen-reader description without a help icon",()=>{
    workspace();const description=document.getElementById(image().getAttribute("aria-describedby")!.split(" ")[0])!;
    expect(description.className).toContain("sr-only");expect(description.textContent).toContain("frozen weighted milestone credit");
    expect(description.textContent).toContain("Missing observations are not zero");expect(description.textContent).toContain("join recorded observations only");
    expect(screen.queryByRole("button",{name:/About|Explore/})).toBeNull();
  });
});

describe("accessible exploration and exact data",()=>{
  it("supports direct chart keyboard exploration with explicit unavailable values",()=>{
    workspace();const chart=image();expect(chart.tabIndex).toBe(0);expect(screen.queryByRole("slider")).toBeNull();
    fireEvent.keyDown(chart,{key:"Home"});expect(selectedValue("DCC accepted")).toBe("10%");expect(selectedValue("Overall submitted")).toBe("Not observed");
    fireEvent.keyDown(chart,{key:"ArrowRight"});expect(selectedValue("Selected date")).toBe("05 Oct 2026");expect(selectedValue("DCC accepted")).toBe("Not observed");
    fireEvent.keyDown(chart,{key:"End"});expect(selectedValue("Selected date")).toBe("20 Oct 2026");
    fireEvent.keyDown(chart,{key:"ArrowLeft"});expect(selectedValue("Selected date")).toBe("15 Oct 2026");fireEvent.keyDown(chart,{key:"ArrowDown"});expect(selectedValue("DCC accepted")).toBe("25%");
    fireEvent.keyDown(chart,{key:"ArrowUp"});expect(selectedValue("DCC accepted")).toBe("40%");
  });
  it("keeps chart inspection preview-safe without exempting the parent",()=>{
    workspace();expect(image().hasAttribute("data-preview-safe")).toBe(true);
    expect(screen.getByRole("region",{name:"Project delivery S-curve"}).hasAttribute("data-preview-safe")).toBe(false);
    expect(screen.queryByRole("button",{name:"Previous curve date"})).toBeNull();expect(screen.queryByRole("button",{name:"Next curve date"})).toBeNull();
  });
  it("selects the nearest real date with touch/pointer input, not an invented axis observation",()=>{
    workspace();const chart=image();vi.spyOn(chart,"getBoundingClientRect").mockReturnValue({left:10,width:640,right:650,top:0,bottom:264,height:264,x:10,y:0,toJSON:()=>({})});
    fireEvent.pointerDown(chart,{clientX:54,clientY:40,pointerType:"touch"});expect(selectedValue("Selected date")).toBe("01 Oct 2026");
    fireEvent.pointerDown(chart,{clientX:632,clientY:40,pointerType:"touch"});expect(selectedValue("Selected date")).toBe("20 Oct 2026");
  });
  it("retains a selected date across refresh and falls back to the latest observation if it disappears",()=>{
    const result=workspace();selectDate(2);
    const next={...result.curve,points:result.curve.points.map(value=>value.date==="2026-10-10"?{...value,accepted:26}:value)};
    result.rerender(<ProjectDeliveryCurve curve={next}/>);expect(selectedValue("DCC accepted")).toBe("26%");
    result.rerender(<ProjectDeliveryCurve curve={{...next,points:next.points.filter(value=>value.date!=="2026-10-10")}}/>);expect(selectedValue("Selected date")).toBe("15 Oct 2026");
  });
  it("offers a captioned exact table with independent submitted/accepted sources and truthful nulls",()=>{
    workspace();expect(screen.queryByText("View curve data")).toBeNull();const table=showData();expect(table.closest("details")).toBeNull();expect(table.closest(".sr-only")).toBeTruthy();
    expect(within(table).getAllByRole("columnheader").map(value=>value.textContent)).toEqual(["Date","Approved plan","Overall submitted","DCC accepted","Submitted source","Accepted source"]);
    expect(within(table).getAllByRole("columnheader").every(value=>value.getAttribute("scope")==="col")).toBe(true);
    const old=within(table).getByRole("rowheader",{name:"01 Oct 2026"}).closest("tr")!;expect(within(old).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["0%","Not observed","10%","—","Saved report"]);
    const live=within(table).getByRole("rowheader",{name:"15 Oct 2026"}).closest("tr")!;expect(within(live).getAllByRole("cell").map(cell=>cell.textContent)).toEqual(["73.7%","65%","40%","Live MDR","Live MDR"]);
    expect(screen.getByRole("region",{name:"S-curve data"}).className).toContain("sr-only");
  });
  it.each([320,390])("keeps equal-time axis dates readable at %spx despite clustered accepted report dates",width=>{
    measuredWidth=width;const dates=["2026-09-07","2026-09-08","2026-09-09","2026-09-11","2026-09-15","2026-09-18","2026-10-09","2026-10-15"];
    const points=dates.map((date,index)=>point(date,index===7?65:null,index?index*5:null,index===7?"live":null,index===7?"live":index?"report":null));
    const original=structuredClone(points);workspace({points,acceptedToday:35,gap:30,acceptedHistoryCount:6,timeline:{plannedStart:"2026-09-07",plannedEnd:"2026-10-15",status:"configured",displayStart:"2026-09-07",displayEnd:"2026-10-15"}});
    expect(image().querySelector("svg")!.getAttribute("viewBox")).toBe(`0 0 ${width} 228`);
    expect(axisLabels().map(text=>Number(text.getAttribute("x")))).toEqual([44,(44+width-18)/2,width-18]);expect(axisLabels().map(text=>text.textContent)).toEqual(["07 Sept 26","26 Sept 26","15 Oct 26"]);
    expect(axisLabels().map(text=>text.getAttribute("text-anchor"))).toEqual(["start","middle","end"]);expect(screen.queryByRole("slider")).toBeNull();
    const table=showData();expect(within(table).getAllByRole("rowheader")).toHaveLength(8);expect(within(table).queryByRole("rowheader",{name:"26 Sept 2026"})).toBeNull();expect(points).toEqual(original);
  });
  it("resizes to five desktop domain labels and keeps a singleton date centred",()=>{
    measuredWidth=320;const result=workspace();act(()=>observers[0].resize(900));
    expect(image().querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 900 264");expect(axisLabels()).toHaveLength(5);
    result.rerender(<ProjectDeliveryCurve curve={{...result.curve,points:[point("2026-10-15",65,40,"live","live")],timeline:{plannedStart:null,plannedEnd:null,status:"missing",displayStart:"2026-10-15",displayEnd:"2026-10-15"}}}/>);
    expect(axisLabels()).toHaveLength(1);expect(axisLabels()[0].getAttribute("text-anchor")).toBe("middle");expect(Number(axisLabels()[0].getAttribute("x"))).toBe((44+900-18)/2);
  });
});

describe("automatic actual-progress marker",()=>{
  it("removes replay and animation settings while keeping exact values and date exploration",()=>{
    const result=workspace();
    expect(screen.queryByRole("button",{name:/replay|animation/i})).toBeNull();
    expect(screen.queryByRole("slider",{name:/animation|speed/i})).toBeNull();
    expect(image().tabIndex).toBe(0);expect(screen.queryByRole("slider")).toBeNull();
    expect(selectedValue("DCC accepted")).toBe("40%");expect(selectedValue("Overall submitted")).toBe("65%");
    expect(traveller(result.container)).toBeTruthy();expect(currentMarker(result.container)).toBeTruthy();
  });
  it("follows the accepted path only and ends at the current accepted observation",()=>{
    const result=workspace(),marker=currentMarker(result.container)!,moving=traveller(result.container)!;
    const acceptedPath=path(result.container,"accepted")!.getAttribute("d")!;
    expect(moving.style.offsetPath).toBe(`path("${acceptedPath}")`);
    expect(acceptedPath).toBe("M 44 209 L 317.79 177.5 L 469.89 146");
    expect(marker.dataset.date).toBe("2026-10-15");expect(marker.dataset.value).toBe("40");
    expect(parseFloat(marker.style.left)).toBeCloseTo(469.894737);expect(parseFloat(marker.style.top)).toBe(146);
    expect(marker.closest('[aria-hidden="true"]')).toBeTruthy();expect(moving.closest('[aria-hidden="true"]')).toBeTruthy();
    expect(marker.tabIndex).toBe(-1);expect(moving.tabIndex).toBe(-1);
    fireEvent.focus(image());const selectionLayer=image().querySelector("svg[class]")!;
    expect(selectionLayer.compareDocumentPosition(marker.parentElement!)&Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it.each([
    {accepted:40,planned:73.7,status:"behind",color:"#b91c1c"},
    {accepted:40,planned:40,status:"achieved",color:"#15803d"},
    {accepted:80,planned:73.7,status:"achieved",color:"#15803d"},
    {accepted:0,planned:0,status:"achieved",color:"#15803d"},
    {accepted:100,planned:100,status:"achieved",color:"#15803d"},
    {accepted:40,planned:40.04,status:"behind",color:"#b91c1c"},
  ])("uses $status colour for accepted $accepted versus today's plan $planned",({accepted,planned,status,color})=>{
    const values=model();values.points[3]={...values.points[3],accepted,planned};
    const result=workspace({...values,acceptedToday:accepted,estimatedPlan:{...values.estimatedPlan,today:planned,acceptedVariance:0}});
    expect(trace(result.container).dataset.progressStatus).toBe(status);
    expect(path(result.container,"accepted")!.getAttribute("stroke")).toBe(color);
    expect(currentMarker(result.container)!.style.color).toBe(color==="#b91c1c"?"rgb(185, 28, 28)":"rgb(21, 128, 61)");
    expect(path(result.container,"submitted")).toBeNull();expect(result.container.querySelector('[data-curve-series="submitted-point"]')?.getAttribute("stroke")).toBe("#b94d20");
  });
  it.each([null,NaN,-1,101])("keeps the actual path neutral when today's estimated comparison is %s",today=>{
    const result=workspace({estimatedPlan:{...model().estimatedPlan,today}});
    expect(trace(result.container).dataset.progressStatus).toBe("unavailable");
    expect(path(result.container,"accepted")!.getAttribute("stroke")).toBe("#10243e");
    expect(currentMarker(result.container)!.style.color).toBe("rgb(16, 36, 62)");
  });
  it.each(["missing","invalid"] as const)("does not claim plan achievement for a %s PM timeline",status=>{
    const result=workspace({timeline:{...model().timeline,status},estimatedPlan:{...model().estimatedPlan,today:0}});
    expect(trace(result.container).dataset.progressStatus).toBe("unavailable");
    expect(path(result.container,"accepted")!.getAttribute("stroke")).toBe("#10243e");expect(currentMarker(result.container)).toBeTruthy();
  });
  it("keeps marker and status at today while exploring historical or future dates",()=>{
    const result=workspace(),marker=currentMarker(result.container)!;
    const position={left:marker.style.left,top:marker.style.top,offsetPath:traveller(result.container)!.style.offsetPath};
    for(const key of ["Home","End"]){
      fireEvent.keyDown(image(),{key});
      expect(currentMarker(result.container)).toBe(marker);expect(marker.dataset.date).toBe("2026-10-15");expect(marker.dataset.value).toBe("40");
      expect(marker.style.left).toBe(position.left);expect(marker.style.top).toBe(position.top);expect(traveller(result.container)!.style.offsetPath).toBe(position.offsetPath);
      expect(trace(result.container).dataset.progressStatus).toBe("behind");
    }
  });
  it("does not extend the traveller to future observations, even if their source claims to be live",()=>{
    const values=model();values.points[4]=point("2026-10-20",100,100,"live","live",100);
    const result=workspace(values);
    expect(traveller(result.container)!.style.offsetPath).toBe('path("M 44 209 L 317.79 177.5 L 469.89 146")');
    expect(currentMarker(result.container)!.dataset.date).toBe("2026-10-15");expect(currentMarker(result.container)!.dataset.value).toBe("40");
    expect(trace(result.container).dataset.progressStatus).toBe("behind");
  });
  it("shows only the current endpoint when no accepted history exists",()=>{
    const result=workspace({historyAvailable:false});
    expect(path(result.container,"accepted")).toBeNull();expect(traveller(result.container)).toBeNull();
    expect(currentMarker(result.container)!.dataset.value).toBe("40");expect(currentMarker(result.container)!.dataset.date).toBe("2026-10-15");
    expect(parseFloat(currentMarker(result.container)!.style.top)).toBe(146);
  });
  it.each([null,"report"] as const)("does not present an old or unverified accepted observation as the live endpoint (%s)",source=>{
    const values=model();values.points[3]={...values.points[3],acceptedSource:source};
    const result=workspace(values);
    expect(currentMarker(result.container)).toBeNull();expect(traveller(result.container)).toBeNull();expect(trace(result.container).dataset.progressStatus).toBe("unavailable");
    expect(path(result.container,"accepted")!.getAttribute("stroke")).toBe("#10243e");
  });
  it.each([NaN,-1,101,null])("does not animate an invalid current accepted value (%s)",accepted=>{
    const values=model();values.points[3]={...values.points[3],accepted};
    const result=workspace(values);
    expect(currentMarker(result.container)).toBeNull();expect(traveller(result.container)).toBeNull();expect(trace(result.container).dataset.progressStatus).toBe("unavailable");
  });
  it("does not animate a historical live-source point when today's accepted observation is absent",()=>{
    const values=model();values.points[2]={...values.points[2],acceptedSource:"live"};values.points[3]={...values.points[3],accepted:null,acceptedSource:null};
    const result=workspace(values);
    expect(currentMarker(result.container)).toBeNull();expect(traveller(result.container)).toBeNull();expect(trace(result.container).dataset.progressStatus).toBe("unavailable");
  });
  it("updates the current marker and path on refresh without changing inputs or waiting for a replay",()=>{
    const result=workspace(),original=structuredClone(result.curve);
    const next={...result.curve,acceptedToday:81,points:result.curve.points.map(value=>value.acceptedSource==="live"?{...value,accepted:81}:value)};
    const nextOriginal=structuredClone(next);result.rerender(<ProjectDeliveryCurve curve={next}/>);
    expect(currentMarker(result.container)!.dataset.value).toBe("81");expect(parseFloat(currentMarker(result.container)!.style.top)).toBeCloseTo(59.9);
    expect(trace(result.container).dataset.progressStatus).toBe("achieved");expect(traveller(result.container)!.style.offsetPath).toContain("469.89 59.9");
    expect(selectedValue("DCC accepted")).toBe("81%");expect(result.curve).toEqual(original);expect(next).toEqual(nextOriginal);
    expect(screen.queryByRole("button",{name:/replay/i})).toBeNull();
  });
  it("keeps the moving path and current endpoint aligned when resized",()=>{
    measuredWidth=320;const result=workspace();
    for(const width of [320,900]){
      act(()=>observers[0].resize(width));
      const endpoint=result.container.querySelector('[data-curve-series="accepted-point"][data-source="live"]')!;
      expect(parseFloat(currentMarker(result.container)!.style.left)).toBeCloseTo(Number(endpoint.getAttribute("cx")));
      expect(parseFloat(currentMarker(result.container)!.style.top)).toBeCloseTo(Number(endpoint.getAttribute("cy")));
      expect(traveller(result.container)!.style.offsetPath).toBe(`path("${path(result.container,"accepted")!.getAttribute("d")}")`);
    }
  });
  it("cleans up container measurement without subscribing to animation events or motion state",()=>{
    const media=vi.fn();vi.stubGlobal("matchMedia",media);
    const result=workspace();expect(media).not.toHaveBeenCalled();result.unmount();expect(observers[0].disconnected).toBe(true);
  });
  it("declares slow CSS loops and honours reduced motion for travel and endpoint glow",()=>{
    const css=readFileSync(resolve(process.cwd(),"src/components/project-delivery-curve.module.css"),"utf8");
    expect(css).toMatch(/animation:\s*[^;{}]*\b20s\b[^;{}]*\binfinite\b/);
    expect(css).toMatch(/animation:\s*[^;{}]*\b3s\b[^;{}]*\binfinite\b/);
    const reducedMotion=css.slice(css.indexOf("@media (prefers-reduced-motion: reduce)"));
    expect(reducedMotion).toContain("@media (prefers-reduced-motion: reduce)");
    expect(reducedMotion).toMatch(/animation:\s*none/);expect(reducedMotion).toMatch(/display:\s*none/);
    expect(css).toMatch(/\.plot\[data-inspecting="true"\][\s\S]*?animation-play-state:\s*paused/);
    expect(css).not.toContain("delivery-curve-reveal");
  });
});

describe("availability without invented history",()=>{
  it("never displays an empty MDR as a zero-progress curve",()=>{
    workspace({hasScope:false,points:[point("2026-10-15",0,0,"live","live")],submittedToday:0,acceptedToday:0,gap:0});expect(screen.getByText("No MDR deliverables yet.")).toBeTruthy();expect(screen.queryByRole("img")).toBeNull();expect(screen.queryByRole("slider")).toBeNull();
  });
  it("does not claim an empty scope when chart points are unavailable",()=>{
    workspace({points:[]});expect(screen.getByText("Progress unavailable.")).toBeTruthy();expect(screen.queryByText("No MDR deliverables yet.")).toBeNull();
  });
  it("keeps both live observations when report history fails without retaining unverified report paths",()=>{
    const result=workspace({historyAvailable:false,submittedHistoryCount:0,acceptedHistoryCount:0,invalidHistoryCount:2});
    expect(screen.queryByText("Saved report history is unavailable. Current observations are still shown.")).toBeNull();expect(screen.queryByText("2 saved report snapshots could not be plotted.")).toBeNull();
    expect(selectedValue("Overall submitted")).toBe("65%");expect(selectedValue("DCC accepted")).toBe("40%");expect(path(result.container,"accepted")).toBeNull();expect(path(result.container,"submitted")).toBeNull();
  });
  it("does not invent zeroes for invalid percentages or unrecognised observation sources",()=>{
    const values=model();values.points[3]={...values.points[3],submitted:NaN,submittedSource:"live",accepted:40,acceptedSource:null};
    workspace({...values,submittedToday:null,gap:null});
    // The latest recognised observation is the prior accepted report.
    selectDate(3);expect(selectedValue("Overall submitted")).toBe("Unavailable");expect(selectedValue("DCC accepted")).toBe("Unavailable");
  });
});
