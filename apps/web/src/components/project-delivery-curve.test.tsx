import {act,cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {afterEach,beforeEach,describe,expect,it,vi} from "vitest";
import {ProjectDeliveryCurve} from "./project-delivery-curve";
import type {DeliveryCurveModel,DeliveryCurvePoint} from "@/lib/project-delivery-curve";

// React checks native animation support while its DOM event module loads.
vi.hoisted(()=>{vi.stubGlobal("AnimationEvent",Event);});

let reduced=false,measuredWidth=640;
const motionListeners=new Set<()=>void>();
const observers:MockResizeObserver[]=[];
class MockResizeObserver implements ResizeObserver{
  disconnected=false;
  constructor(readonly callback:ResizeObserverCallback){observers.push(this);}
  observe(){this.resize(measuredWidth);}
  unobserve(){}
  disconnect(){this.disconnected=true;}
  resize(width:number){this.callback([{contentRect:{width}}] as ResizeObserverEntry[],this);}
}
function point(date:string,planned:number|null,actual:number|null,actualSource:DeliveryCurvePoint["actualSource"]=null):DeliveryCurvePoint{return {date,planned,actual,actualSource};}
function model(overrides:Partial<DeliveryCurveModel>={}):DeliveryCurveModel{
  return {points:[point("2026-10-01",0,10,"report"),point("2026-10-05",30,null),point("2026-10-10",60,25,"report"),point("2026-10-15",80,40,"live"),point("2026-10-20",100,null)],
    asOf:"2026-10-15T10:30:00.000Z",plannedToday:80,actualToday:40,variance:-40,plannedCoverage:100,undatedCount:0,historyCount:2,invalidHistoryCount:0,hasScope:true,historyAvailable:true,...overrides};
}
function workspace(overrides:Partial<DeliveryCurveModel>={}){const curve=model(overrides);return {...render(<ProjectDeliveryCurve curve={curve}/>),curve};}
function selectedValue(label:string){const status=screen.getByRole("status");return within(status).getByText(label,{selector:"dt"}).nextElementSibling!.textContent;}
function trace(container:HTMLElement){return container.querySelector<HTMLElement>("[data-curve-traces]")!;}
function path(container:HTMLElement,series:string){return container.querySelector<SVGPathElement>(`path[data-curve-series="${series}"]`);}
function preference(value:boolean){act(()=>{reduced=value;motionListeners.forEach(listener=>listener());});}
function showData(){fireEvent.click(screen.getByText("View curve data"));return screen.getByRole("table",{name:"Project delivery S-curve data"});}

beforeEach(()=>{
  reduced=false;measuredWidth=640;motionListeners.clear();observers.length=0;
  const media={get matches(){return reduced;},media:"(prefers-reduced-motion: reduce)",addEventListener:vi.fn((_type:string,listener:()=>void)=>motionListeners.add(listener)),removeEventListener:vi.fn((_type:string,listener:()=>void)=>motionListeners.delete(listener))};
  vi.stubGlobal("matchMedia",vi.fn(()=>media));vi.stubGlobal("ResizeObserver",MockResizeObserver);vi.stubGlobal("PointerEvent",MouseEvent);
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe("truthful delivery chart geometry",()=>{
  it("renders a labelled chart with real current values immediately, not animated counters",()=>{
    const result=workspace();
    expect(screen.getByRole("heading",{name:"Project delivery S-curve"})).toBeTruthy();
    expect(screen.getByRole("img",{name:"Project delivery S-curve"}).getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText(/Live snapshot · 15 Oct 2026/)).toBeTruthy();
    expect(selectedValue("Selected date")).toBe("15 Oct 2026");expect(selectedValue("Planned")).toBe("80%");expect(selectedValue("Actual · live MDR")).toBe("40%");
    expect(screen.getByText("Current snapshot: 40 percentage points behind plan.")).toBeTruthy();
    expect(trace(result.container).getAttribute("data-animating")).toBe("true");
    expect(path(result.container,"actual")?.getAttribute("stroke")).toBe("#0c5b45");
    expect(path(result.container,"planned")?.getAttribute("stroke")).toBe("#24384f");expect(path(result.container,"planned")?.getAttribute("stroke-dasharray")).toBe("6 6");
  });
  it("keeps planned progress horizontal until each milestone date before moving vertically",()=>{
    const result=workspace();const d=path(result.container,"planned")!.getAttribute("d")!;
    expect(d).toBe("M 44 230 H 165.68 V 167 H 317.79 V 104 H 469.89 V 62 H 622 V 20");
    expect(d).not.toContain(" L ");
  });
  it("connects successive real actual observations across planned-only samples without adding zero points",()=>{
    const result=workspace();const d=path(result.container,"actual")!.getAttribute("d")!;
    expect(d).toBe("M 44 209 L 317.79 177.5 L 469.89 146");
    expect(d.match(/L/g)).toHaveLength(2);expect(d).not.toContain("165.68");expect(d).not.toContain("622");
  });
  it("never plots future actual values even if a malformed supplied model contains one",()=>{
    const values=model();values.points[4]={...values.points[4],actual:90,actualSource:"report"};
    const result=render(<ProjectDeliveryCurve curve={values}/>);
    expect(path(result.container,"actual")!.getAttribute("d")).toBe("M 44 209 L 317.79 177.5 L 469.89 146");
    const table=showData(),future=within(table).getByRole("rowheader",{name:"20 Oct 2026"}).closest("tr")!;
    expect(within(future).getByText("Not observed")).toBeTruthy();expect(within(future).queryByText("90%")).toBeNull();
    fireEvent.keyDown(screen.getByRole("slider"),{key:"End"});expect(selectedValue("Actual")).toBe("Not observed");
  });
  it("shows one current observation as a marker with no invented historical segment",()=>{
    const result=workspace({points:[point("2026-10-15",null,40,"live")],plannedToday:null,variance:null,plannedCoverage:0,undatedCount:2,historyCount:0});
    expect(path(result.container,"actual")).toBeNull();expect(path(result.container,"planned")).toBeNull();
    expect(result.container.querySelectorAll('[data-curve-series="actual-point"][data-source="live"]')).toHaveLength(1);
    expect(screen.getByText("Historical trend will appear as project reports are saved.")).toBeTruthy();
    expect(screen.queryByRole("button",{name:"Replay animation"})).toBeNull();expect((screen.getByRole("slider") as HTMLInputElement).disabled).toBe(true);
    expect(selectedValue("Actual · live MDR")).toBe("40%");
  });
  it("never invents a planned baseline when final-issue dates are missing",()=>{
    const points=model().points.map(value=>({...value,planned:null}));
    const result=workspace({points,plannedToday:null,variance:null,plannedCoverage:0,undatedCount:5});
    expect(path(result.container,"planned")).toBeNull();expect(selectedValue("Planned · dated scope")).toBe("Not available");
    expect(screen.getByText(/Planned curve unavailable\. Add final-issue dates/)).toBeTruthy();
    expect(screen.queryByText(/percentage points behind plan/)).toBeNull();expect(path(result.container,"actual")).toBeTruthy();
  });
  it("keeps a partial weighted plan below full coverage without manufacturing a full-plan variance",()=>{
    const points=model().points.map(value=>({...value,planned:value.planned===null?null:Math.min(65,value.planned)}));
    const result=workspace({points,plannedCoverage:65,undatedCount:2,plannedToday:null,variance:null});
    expect(selectedValue("Planned · dated scope")).toBe("65%");expect(screen.getByText(/Final-issue dates cover 65% of weighted scope/)).toBeTruthy();
    expect(path(result.container,"planned")!.getAttribute("d")).toContain("V 93.5");expect(path(result.container,"planned")!.getAttribute("d")).not.toContain("V 20");
    expect(screen.queryByText(/Current snapshot:/)).toBeNull();
  });
  it.each([0,12.5])("labels current on/ahead-of-plan variance correctly (%s)",variance=>{
    workspace({variance});expect(screen.getByText(variance===0?"Current snapshot: on plan.":"Current snapshot: 12.5 percentage points ahead of plan.")).toBeTruthy();
  });
});

describe("date exploration and data alternative",()=>{
  it("supports native range changes, Home/End and arrow keys with exact announced values",()=>{
    workspace();const slider=screen.getByRole("slider",{name:"Explore curve dates"}) as HTMLInputElement;
    expect(slider.min).toBe("0");expect(slider.max).toBe("4");expect(slider.step).toBe("1");expect(slider.value).toBe("3");expect(slider.hasAttribute("data-preview-safe")).toBe(true);
    expect(slider.getAttribute("aria-valuetext")).toBe("15 Oct 2026; planned 80%; actual 40%");
    fireEvent.keyDown(slider,{key:"Home"});expect(slider.value).toBe("0");expect(selectedValue("Actual · saved report")).toBe("10%");
    expect((screen.getByRole("button",{name:"Previous curve date"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(slider,{key:"ArrowRight"});expect(selectedValue("Selected date")).toBe("05 Oct 2026");expect(selectedValue("Actual")).toBe("Not observed");
    fireEvent.keyDown(slider,{key:"End"});expect(slider.value).toBe("4");expect(selectedValue("Selected date")).toBe("20 Oct 2026");expect(selectedValue("Actual")).toBe("Not observed");
    expect((screen.getByRole("button",{name:"Next curve date"}) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.keyDown(slider,{key:"ArrowLeft"});expect(slider.value).toBe("3");
    fireEvent.change(slider,{target:{value:"2"}});expect(selectedValue("Actual · saved report")).toBe("25%");
  });
  it("offers touch-sized previous/next controls without any mutation exemption on a parent",()=>{
    workspace();const previous=screen.getByRole("button",{name:"Previous curve date"}),next=screen.getByRole("button",{name:"Next curve date"});
    for(const control of [previous,next]){expect(control.getAttribute("type")).toBe("button");expect(control.hasAttribute("data-preview-safe")).toBe(true);expect(control.className).toContain("size-11");expect(control.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");}
    expect(screen.getByRole("region",{name:"Project delivery S-curve"}).hasAttribute("data-preview-safe")).toBe(false);
    fireEvent.click(previous);expect(selectedValue("Selected date")).toBe("10 Oct 2026");fireEvent.click(next);expect(selectedValue("Selected date")).toBe("15 Oct 2026");
  });
  it("selects the nearest real date from a pointer/touch position on the chart",()=>{
    workspace();const chart=screen.getByRole("img",{name:"Project delivery S-curve"});
    vi.spyOn(chart,"getBoundingClientRect").mockReturnValue({left:10,width:640,right:650,top:0,bottom:264,height:264,x:10,y:0,toJSON:()=>({})});
    fireEvent.pointerDown(chart,{clientX:54,clientY:40,pointerType:"touch"});expect(selectedValue("Selected date")).toBe("01 Oct 2026");
    fireEvent.pointerDown(chart,{clientX:632,clientY:40,pointerType:"touch"});expect(selectedValue("Selected date")).toBe("20 Oct 2026");
  });
  it("retains a selected date across refreshed model values and falls back to the real live point if removed",()=>{
    const result=workspace();fireEvent.change(screen.getByRole("slider"),{target:{value:"2"}});expect(selectedValue("Selected date")).toBe("10 Oct 2026");
    const refreshed={...result.curve,points:result.curve.points.map(value=>value.date==="2026-10-10"?{...value,actual:26}:value)};
    result.rerender(<ProjectDeliveryCurve curve={refreshed}/>);expect(selectedValue("Actual · saved report")).toBe("26%");
    result.rerender(<ProjectDeliveryCurve curve={{...refreshed,points:refreshed.points.filter(value=>value.date!=="2026-10-10")}}/>);expect(selectedValue("Selected date")).toBe("15 Oct 2026");
  });
  it("provides all exact dates, nulls and sources in a captioned, keyboard-scrollable data table",()=>{
    workspace();const disclosure=screen.getByText("View curve data").closest("details")!;expect(disclosure.open).toBe(false);
    const table=showData();expect(disclosure.open).toBe(true);
    expect(within(table).getAllByRole("columnheader").map(value=>value.textContent)).toEqual(["Date","Planned","Actual","Actual source"]);
    expect(within(table).getAllByRole("columnheader").every(value=>value.getAttribute("scope")==="col")).toBe(true);
    expect(within(table).getAllByRole("row")).toHaveLength(6);
    const live=within(table).getByRole("rowheader",{name:"15 Oct 2026"}).closest("tr")!;
    expect(within(live).getByText("40%")).toBeTruthy();expect(within(live).getByText("Live MDR")).toBeTruthy();
    const historic=within(table).getByRole("rowheader",{name:"01 Oct 2026"}).closest("tr")!;expect(within(historic).getByText("Saved report")).toBeTruthy();
    const plannedOnly=within(table).getByRole("rowheader",{name:"05 Oct 2026"}).closest("tr")!;expect(within(plannedOnly).getByText("Not observed")).toBeTruthy();
    expect(screen.getByRole("region",{name:"S-curve data — scroll horizontally for all columns"}).tabIndex).toBe(0);
  });
  it("keeps axis text readable at measured 320px and adjusts when the container resizes",()=>{
    measuredWidth=320;workspace();const chart=screen.getByRole("img",{name:"Project delivery S-curve"});
    const svg=chart.querySelector("svg")!;expect(svg.getAttribute("viewBox")).toBe("0 0 320 228");
    const xLabels=[...svg.querySelectorAll("text")].filter(text=>!text.textContent?.includes("%"));expect(xLabels).toHaveLength(3);expect(xLabels.every(text=>text.getAttribute("fontSize")==="11"||text.getAttribute("font-size")==="11")).toBe(true);
    expect(chart.style.height).toBe("228px");
    act(()=>observers[0].resize(900));expect(svg.getAttribute("viewBox")).toBe("0 0 900 264");
    expect(svg.querySelectorAll("text")).toHaveLength(10);
  });
  it.each([320,390])("spaces date-axis labels across time instead of clustered report indices at %spx",width=>{
    measuredWidth=width;
    const dates=["2026-09-07","2026-09-08","2026-09-09","2026-09-11","2026-09-15","2026-09-18","2026-10-09","2026-10-15"];
    const points=dates.map((date,index)=>point(date,null,index?index*5:null,index===7?"live":index?"report":null));
    const original=structuredClone(points);
    const result=workspace({points,plannedToday:null,variance:null,plannedCoverage:0,undatedCount:3,historyCount:6,actualToday:35});
    const svg=screen.getByRole("img",{name:"Project delivery S-curve"}).querySelector("svg")!;
    const labels=[...svg.querySelectorAll("text")].filter(text=>!text.textContent?.includes("%"));
    expect(labels.map(text=>Number(text.getAttribute("x")))).toEqual([44,(44+width-18)/2,width-18]);
    expect(labels.map(text=>text.textContent)).toEqual(["07 Sept 26","26 Sept 26","15 Oct 26"]);
    expect(labels.map(text=>text.getAttribute("text-anchor"))).toEqual(["start","middle","end"]);
    expect((screen.getByRole("slider") as HTMLInputElement).max).toBe("7");expect(selectedValue("Actual · live MDR")).toBe("35%");
    expect(path(result.container,"actual")!.getAttribute("d")!.match(/L/g)).toHaveLength(6);expect(path(result.container,"planned")).toBeNull();
    const table=showData();expect(within(table).getAllByRole("rowheader")).toHaveLength(8);
    expect(within(table).queryByRole("rowheader",{name:"26 Sept 2026"})).toBeNull();expect(points).toEqual(original);
  });
  it("uses five evenly positioned UTC-domain ticks on desktop even when real observations are clustered",()=>{
    measuredWidth=900;
    workspace({points:[point("2026-09-07",0,10,"report"),point("2026-09-08",10,15,"report"),point("2026-09-09",20,20,"report"),point("2026-10-15",100,40,"live")]});
    const svg=screen.getByRole("img",{name:"Project delivery S-curve"}).querySelector("svg")!;
    const labels=[...svg.querySelectorAll("text")].filter(text=>!text.textContent?.includes("%"));
    expect(labels.map(text=>Number(text.getAttribute("x")))).toEqual([44,253.5,463,672.5,882]);
    expect(labels[0].textContent).toBe("07 Sept 26");expect(labels.at(-1)!.textContent).toBe("15 Oct 26");
    expect((screen.getByRole("slider") as HTMLInputElement).max).toBe("3");
  });
  it("keeps short date ranges distinct and a single date centred without adding data points",()=>{
    const result=workspace({points:[point("2026-10-14",50,30,"report"),point("2026-10-15",80,40,"live")]});
    const labels=()=>[...screen.getByRole("img",{name:"Project delivery S-curve"}).querySelector("svg")!.querySelectorAll("text")].filter(text=>!text.textContent?.includes("%"));
    expect(labels().map(text=>text.textContent)).toEqual(["14 Oct 26","15 Oct 26"]);
    result.rerender(<ProjectDeliveryCurve curve={{...result.curve,points:[point("2026-10-15",80,40,"live")]}}/>);
    expect(labels()).toHaveLength(1);expect(labels()[0].textContent).toBe("15 Oct 26");expect(labels()[0].getAttribute("text-anchor")).toBe("middle");
    expect(Number(labels()[0].getAttribute("x"))).toBe((44+640-18)/2);
  });
});

describe("motion preference and replay",()=>{
  it("reveals once, keeps final selected values, and replays only on an explicit request",()=>{
    const result=workspace();const first=trace(result.container);expect(first.getAttribute("data-animating")).toBe("true");
    expect(selectedValue("Actual · live MDR")).toBe("40%");
    fireEvent.animationEnd(first);expect(trace(result.container).getAttribute("data-animating")).toBe("false");
    result.rerender(<ProjectDeliveryCurve curve={{...result.curve,actualToday:41,points:result.curve.points.map(value=>value.actualSource==="live"?{...value,actual:41}:value)}}/>);
    expect(trace(result.container)).toBe(first);expect(trace(result.container).getAttribute("data-animating")).toBe("false");expect(selectedValue("Actual · live MDR")).toBe("41%");
    const replay=screen.getByRole("button",{name:"Replay animation"});expect(replay.hasAttribute("data-preview-safe")).toBe(true);expect(replay.getAttribute("type")).toBe("button");
    fireEvent.click(replay);expect(trace(result.container)).not.toBe(first);expect(trace(result.container).getAttribute("data-animating")).toBe("true");
    fireEvent.animationEnd(trace(result.container));expect(trace(result.container).getAttribute("data-animating")).toBe("false");
  });
  it("does not animate or allow replay when reduced motion is requested",()=>{
    reduced=true;const result=workspace();expect(trace(result.container).getAttribute("data-animating")).toBe("false");
    expect((screen.getByRole("button",{name:"Replay animation"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("button",{name:"Replay animation"}).getAttribute("aria-describedby")).toBeTruthy();
    expect(selectedValue("Actual · live MDR")).toBe("40%");
  });
  it("cancels ongoing motion immediately when preference changes and does not auto-restart",()=>{
    const result=workspace();expect(trace(result.container).getAttribute("data-animating")).toBe("true");
    preference(true);expect(trace(result.container).getAttribute("data-animating")).toBe("false");expect((screen.getByRole("button",{name:"Replay animation"}) as HTMLButtonElement).disabled).toBe(true);
    preference(false);expect(trace(result.container).getAttribute("data-animating")).toBe("false");expect((screen.getByRole("button",{name:"Replay animation"}) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button",{name:"Replay animation"}));expect(trace(result.container).getAttribute("data-animating")).toBe("true");
  });
  it("cleans up measurement and motion subscriptions on unmount",()=>{
    const result=workspace();expect(motionListeners.size).toBe(1);expect(observers).toHaveLength(1);
    result.unmount();expect(motionListeners.size).toBe(0);expect(observers[0].disconnected).toBe(true);
  });
});

describe("truthful availability states",()=>{
  it("does not display a zero-progress chart when there is no MDR scope",()=>{
    workspace({hasScope:false,points:[point("2026-10-15",null,0,"live")],actualToday:0});
    expect(screen.getByText("Add MDR deliverables to start tracking the delivery curve.")).toBeTruthy();
    expect(screen.queryByRole("img",{name:"Project delivery S-curve"})).toBeNull();expect(screen.queryByRole("slider")).toBeNull();expect(screen.queryByText("0%")).toBeNull();
  });
  it("reports an unavailable curve without implying an empty MDR when no points arrived",()=>{
    workspace({points:[]});expect(screen.getByText("The delivery curve is unavailable. Refresh progress to try again.")).toBeTruthy();expect(screen.queryByRole("img",{name:"Project delivery S-curve"})).toBeNull();
  });
  it("keeps the live value when saved report history is unavailable and discloses skipped snapshots",()=>{
    const result=workspace({historyAvailable:false,historyCount:0,invalidHistoryCount:2});
    expect(screen.getByText("Saved report history is unavailable. Current MDR progress is still shown.")).toBeTruthy();expect(screen.getByText("2 saved report snapshots could not be plotted.")).toBeTruthy();
    expect(selectedValue("Actual · live MDR")).toBe("40%");
    expect(path(result.container,"actual")).toBeNull();
  });
  it("keeps chart guidance behind a labelled help icon and explains saved-scope history",()=>{
    workspace();expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.focus(screen.getByRole("button",{name:"About the project delivery S-curve"}));
    expect(screen.getByRole("tooltip").textContent).toContain("each retaining its scope at that time");expect(screen.getByRole("tooltip").textContent).toContain("missing dates are not replaced with an assumed plan");
  });
});
