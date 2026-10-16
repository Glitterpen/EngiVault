import {HelpTip} from "@/components/help-tip";
import {isProjectSCurveWeeklyDate,projectSCurveCurrentWeekDate,projectSCurveProgress,type ProjectReportSnapshot} from "@/lib/project-report";
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
      <div className="flex flex-wrap items-center justify-between gap-3 px-1"><HelpTip label="Reading the S-curve">Cumulative planned final milestones and stage-weighted actual progress across the MDR scope.</HelpTip><div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-[.08em] text-[#617083]"><Legend colour="#b94d20" label="Planned progress" dashed/><Legend colour="#10243e" label="Stage-weighted actual"/></div></div>
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

function Legend({colour,label,dashed=false}:{colour:string;label:string;dashed?:boolean}){return <span className="inline-flex items-center gap-2"><span aria-hidden="true" className="w-7 border-t-2" style={{borderColor:colour,borderTopStyle:dashed?"dashed":"solid"}}/>{label}</span>}
function formatCurveDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"2-digit"})}
function formatPercentage(value:number){return `${Number.isInteger(value)?value:value.toFixed(1)}%`}
