import {HelpTip} from "@/components/help-tip";
import {approvedProjectSCurveProgress,isProjectSCurveWeeklyDate,projectSCurveCurrentWeekDate,projectSCurveProgress,type ProjectReportSnapshot} from "@/lib/project-report";
import {ReportScrollRegion} from "@/components/report-scroll-region";
import styles from "@/components/project-report-presentation.module.css";

type SCurve=ProjectReportSnapshot["s_curve"];
const WIDTH=920;
const HEIGHT=340;
const LEFT=58;
const RIGHT=24;
const TOP=28;
const BOTTOM=100;

export function ProjectSCurve({curve,totalDeliverables,reportPeriodEnd}:{curve:SCurve;totalDeliverables:number;reportPeriodEnd:string}){
  if(curve.planning_baseline)return <ApprovedProjectSCurve curve={curve} totalDeliverables={totalDeliverables}/>;
  const points=projectSCurveProgress(curve,totalDeliverables);
  if(points.length<2)return <div className="mt-4 rounded-xl border border-dashed border-[#d6e0ed] bg-[#f7f9fc] p-8 text-center text-sm text-[#617083]">The S-curve will appear after MDR submission dates and issued deliverables are available.</div>;
  const plotWidth=WIDTH-LEFT-RIGHT;
  const plotHeight=HEIGHT-TOP-BOTTOM;
  const firstDate=new Date(`${points[0].date}T00:00:00Z`).getTime();
  const lastDate=new Date(`${points[points.length-1].date}T00:00:00Z`).getTime();
  const x=(value:string)=>LEFT+Math.min(1,Math.max(0,(new Date(`${value}T00:00:00Z`).getTime()-firstDate)/Math.max(1,lastDate-firstDate)))*plotWidth;
  const y=(value:number)=>TOP+plotHeight-(value/100)*plotHeight;
  const plannedPoints=points.map(point=>`${x(point.date)},${y(point.planned)}`).join(" ");
  const completedPoints=points.map(point=>point.actual===null?null:`${x(point.date)},${y(point.actual)}`).filter(Boolean).join(" ");
  const yTicks=[0,25,50,75,100];
  const currentWeekDate=projectSCurveCurrentWeekDate(points.map(point=>point.date),reportPeriodEnd);
  const currentWeekX=x(currentWeekDate);
  return <>
    <div className="mt-4 min-w-0 rounded-2xl border border-[#dce3ec] bg-white p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1"><HelpTip label="Reading the S-curve">Planned progress follows the MDR final-issue dates. Actual progress reflects the accepted milestone credit recorded in this report, not the number of files uploaded.</HelpTip><div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-[.08em] text-[#617083]"><Legend colour="#b94d20" label="Planned progress" dashed/><Legend colour="#10243e" label="Stage-weighted actual"/></div></div>
      <ReportScrollRegion label="Project delivery S-curve" className="mt-2"><svg className={styles.curvePlot} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Project S-curve comparing cumulative planned and actual percentage progress against dates">
        <desc>Planned progress is the orange dashed line. Stage-weighted actual progress is the solid navy line. The vertical dotted guide marks the reporting week.</desc>
        <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} rx="10" fill="#f7f9fc"/>
        {yTicks.map(value=><g key={value}><line x1={LEFT} x2={WIDTH-RIGHT} y1={y(value)} y2={y(value)} stroke="#dce3ec" strokeWidth="1"/><text x={LEFT-12} y={y(value)+4} textAnchor="end" fontSize="11" fill="#617083">{value}%</text></g>)}
        <line x1={LEFT} x2={LEFT} y1={TOP} y2={TOP+plotHeight} stroke="#aebcd0"/><line x1={LEFT} x2={WIDTH-RIGHT} y1={TOP+plotHeight} y2={TOP+plotHeight} stroke="#aebcd0"/>
        <polyline points={plannedPoints} fill="none" stroke="#b94d20" strokeWidth="4" strokeDasharray="6 5" strokeLinejoin="round" strokeLinecap="round"/>
        {completedPoints?<polyline points={completedPoints} fill="none" stroke="#10243e" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>:null}
        <line x1={currentWeekX} x2={currentWeekX} y1={TOP} y2={TOP+plotHeight} stroke="#617083" strokeWidth="1" strokeDasharray="4 5" opacity=".3"/>
        {points.map((point,index)=><g key={`${point.date}-${index}`}><circle cx={x(point.date)} cy={y(point.planned)} r="3" fill="#b94d20"/><text x={x(point.date)} y={y(point.planned)-9} textAnchor="middle" fontSize="9" fontWeight="700" fill="#a64019">{formatPercentage(point.planned)}</text>{point.actual!==null?<><circle cx={x(point.date)} cy={y(point.actual)} r="3" fill="#10243e"/><text x={x(point.date)} y={y(point.actual)+15} textAnchor="middle" fontSize="9" fontWeight="700" fill="#10243e">{formatPercentage(point.actual)}</text></>:null}</g>)}
        {points.filter(point=>isProjectSCurveWeeklyDate(point.date,points[0].date)).map(point=>{const labelX=x(point.date),labelY=HEIGHT-14;return <text key={`${point.date}-label`} x={labelX} y={labelY} transform={`rotate(-90 ${labelX} ${labelY})`} textAnchor="start" fontSize="10" fill="#617083">{formatCurveDate(point.date)}</text>})}
        <text x="16" y={TOP+plotHeight/2} transform={`rotate(-90 16 ${TOP+plotHeight/2})`} textAnchor="middle" fontSize="11" fontWeight="700" fill="#617083">Progress (%)</text>
      </svg></ReportScrollRegion>
    </div>
    <ReportScrollRegion label="S-curve discipline summary" className="mt-4 rounded-xl border border-[#dce3ec]"><table className="w-full min-w-[680px] text-left text-xs"><caption className="sr-only">S-curve discipline summary</caption><thead className="bg-[#f1f5fa] uppercase tracking-[.08em] text-[#617083]"><tr><th scope="col" className="p-3.5">Discipline</th><th scope="col">Planned scope</th><th scope="col">Terminal issued</th><th scope="col">Terminal variance</th><th scope="col" className="pr-3.5">Stage-weighted completion</th></tr></thead><tbody>{curve.disciplines.map(row=><tr className="border-t border-[#edf1f6]" key={row.discipline}><th scope="row" className="p-3.5 font-semibold text-[#24384f]">{row.discipline}</th><td>{row.planned}</td><td>{row.completed}</td><td className={row.variance<0?"font-semibold text-[#a5452f]":"font-semibold text-[#10243e]"}>{row.variance>0?`+${row.variance}`:row.variance}</td><td className="pr-3.5"><div className="flex min-w-32 items-center gap-2 print:min-w-0"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e2e8f0]"><div className="h-full bg-[#10243e]" style={{width:`${row.completion_percent}%`}}/></div><b>{row.completion_percent}%</b></div></td></tr>)}</tbody></table></ReportScrollRegion>
  </>;
}

/** Additive snapshot version: no legacy count/date or renderer semantics change. */
function ApprovedProjectSCurve({curve,totalDeliverables}:{curve:SCurve;totalDeliverables:number}){
  const points=approvedProjectSCurveProgress(curve,totalDeliverables);
  if(points.length<2)return <p className="mt-4 text-sm text-[#617083]">Progress observations unavailable.</p>;
  const plotWidth=WIDTH-LEFT-RIGHT,plotHeight=HEIGHT-TOP-BOTTOM;
  const first=Date.parse(`${points[0].date}T00:00:00Z`),last=Date.parse(`${points.at(-1)!.date}T00:00:00Z`);
  const x=(date:string)=>LEFT+(Date.parse(`${date}T00:00:00Z`)-first)/Math.max(1,last-first)*plotWidth;
  const y=(value:number)=>TOP+plotHeight-value/100*plotHeight;
  const planned=points.filter((point):point is typeof point&{planned:number}=>point.planned!==null);
  const actual=points.filter((point):point is typeof point&{actual:number}=>point.actual!==null);
  const planPath=planned.map((point,index)=>index===0?`M ${x(point.date)} ${y(point.planned)}`:`H ${x(point.date)} V ${y(point.planned)}`).join(" ");
  const tickCount=Math.min(6,points.length),ticks=[...new Set(Array.from({length:tickCount},(_,index)=>Math.round(index*(points.length-1)/Math.max(1,tickCount-1))))];
  return <>
    <div className="mt-4 min-w-0 rounded-2xl border border-[#dce3ec] bg-white p-3 sm:p-5">
      <div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-[.08em] text-[#617083]"><Legend colour="#b94d20" label={planned.length?"Approved milestone plan":"Approved plan unavailable"} dashed/><Legend colour="#10243e" label="Stage-weighted actual"/></div>
      <ReportScrollRegion label="Project delivery S-curve" className="mt-2"><svg className={styles.curvePlot} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Approved weighted milestone plan and accepted actual progress">
        <desc>Planned credit increases only on approved milestone dates. Actual progress is unchanged. An unavailable plan is not shown as zero.</desc>
        <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} rx="10" fill="#f7f9fc"/>
        {[0,25,50,75,100].map(value=><g key={value}><line x1={LEFT} x2={WIDTH-RIGHT} y1={y(value)} y2={y(value)} stroke="#dce3ec"/><text x={LEFT-12} y={y(value)+4} textAnchor="end" fontSize="11" fill="#617083">{value}%</text></g>)}
        {planPath&&<path data-baseline-plan="step" d={planPath} fill="none" stroke="#b94d20" strokeWidth="3" strokeDasharray="6 5"/>}
        {actual.length>1&&<polyline points={actual.map(point=>`${x(point.date)},${y(point.actual)}`).join(" ")} fill="none" stroke="#10243e" strokeWidth="3"/>}
        {actual.map(point=><circle key={point.date} cx={x(point.date)} cy={y(point.actual)} r="3" fill="#10243e"/>)}
        {ticks.map(index=><text key={points[index].date} x={x(points[index].date)} y={HEIGHT-36} textAnchor={index===0?"start":index===points.length-1?"end":"middle"} fontSize="10" fill="#617083">{formatCurveDate(points[index].date)}</text>)}
      </svg></ReportScrollRegion>
    </div>
    <ReportScrollRegion label="S-curve discipline summary" className="mt-4 rounded-xl border border-[#dce3ec]"><table className="w-full min-w-[680px] text-left text-xs"><caption className="sr-only">Approved baseline discipline summary</caption><thead className="bg-[#f1f5fa] text-[#617083]"><tr><th scope="col" className="p-3.5">Discipline</th><th scope="col">Scope</th><th scope="col">Terminal issued</th><th scope="col">Terminal variance</th><th scope="col">Accepted progress</th></tr></thead><tbody>{curve.disciplines.map(row=><tr key={row.discipline} className="border-t border-[#edf1f6]"><th scope="row" className="p-3.5">{row.discipline}</th><td>{row.planned}</td><td>{row.completed}</td><td>{row.baseline_variance===null||row.baseline_variance===undefined?"N/A":row.baseline_variance}</td><td>{row.completion_percent}%</td></tr>)}</tbody></table></ReportScrollRegion>
    <div className="sr-only"><table><caption>Approved baseline S-curve values</caption><thead><tr><th scope="col">Date</th><th scope="col">Approved plan</th><th scope="col">Actual</th></tr></thead><tbody>{points.map(point=><tr key={point.date}><th scope="row">{point.date}</th><td>{point.planned===null?"N/A":`${point.planned}%`}</td><td>{point.actual===null?"N/A":`${point.actual}%`}</td></tr>)}</tbody></table></div>
  </>;
}

function Legend({colour,label,dashed=false}:{colour:string;label:string;dashed?:boolean}){return <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-7 border-t-2" style={{borderColor:colour,borderTopStyle:dashed?"dashed":"solid"}}/>{label}</span>}
function formatCurveDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"2-digit"})}
function formatPercentage(value:number){return `${Number.isInteger(value)?value:value.toFixed(1)}%`}
