import {isProjectSCurveWeeklyDate,projectSCurveCurrentWeekDate,projectSCurveProgress,type ProjectReportSnapshot} from "@/lib/project-report";

type SCurve=ProjectReportSnapshot["s_curve"];
const WIDTH=920;
const HEIGHT=340;
const LEFT=58;
const RIGHT=24;
const TOP=28;
const BOTTOM=100;

export function ProjectSCurve({curve,totalDeliverables,reportPeriodEnd}:{curve:SCurve;totalDeliverables:number;reportPeriodEnd:string}){
  const points=projectSCurveProgress(curve,totalDeliverables);
  if(points.length<2)return <div className="mt-4 rounded-xl border border-dashed border-[#cfd9d4] bg-[#f8faf9] p-8 text-center text-sm text-[#617083]">The S-curve will appear after MDR submission dates and issued deliverables are available.</div>;
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
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#dfe7e3] bg-white p-3 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 px-1"><p className="text-xs leading-5 text-[#617083]">Cumulative planned final milestones and stage-weighted actual progress across the MDR scope.</p><div className="flex flex-wrap gap-4 text-[10px] font-bold uppercase tracking-[.08em] text-[#617083]"><Legend colour="#ed7138" label="Planned progress"/><Legend colour="#0c5b45" label="Stage-weighted actual"/></div></div>
      <svg className="mt-2 h-auto w-full" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label="Project S-curve comparing cumulative planned and actual percentage progress against dates">
        <rect x={LEFT} y={TOP} width={plotWidth} height={plotHeight} rx="10" fill="#f8faf9"/>
        {yTicks.map(value=><g key={value}><line x1={LEFT} x2={WIDTH-RIGHT} y1={y(value)} y2={y(value)} stroke="#dfe7e3" strokeWidth="1"/><text x={LEFT-12} y={y(value)+4} textAnchor="end" fontSize="11" fill="#617083">{value}%</text></g>)}
        <line x1={LEFT} x2={LEFT} y1={TOP} y2={TOP+plotHeight} stroke="#aebbb5"/><line x1={LEFT} x2={WIDTH-RIGHT} y1={TOP+plotHeight} y2={TOP+plotHeight} stroke="#aebbb5"/>
        <polyline points={plannedPoints} fill="none" stroke="#ed7138" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>
        {completedPoints?<polyline points={completedPoints} fill="none" stroke="#0c5b45" strokeWidth="4" strokeLinejoin="round" strokeLinecap="round"/>:null}
        <line x1={currentWeekX} x2={currentWeekX} y1={TOP} y2={TOP+plotHeight} stroke="#617083" strokeWidth="1" strokeDasharray="4 5" opacity=".3"/>
        {points.map((point,index)=><g key={`${point.date}-${index}`}><circle cx={x(point.date)} cy={y(point.planned)} r="3" fill="#ed7138"/><text x={x(point.date)} y={y(point.planned)-9} textAnchor="middle" fontSize="9" fontWeight="700" fill="#d85f28">{formatPercentage(point.planned)}</text>{point.actual!==null?<><circle cx={x(point.date)} cy={y(point.actual)} r="3" fill="#0c5b45"/><text x={x(point.date)} y={y(point.actual)+15} textAnchor="middle" fontSize="9" fontWeight="700" fill="#0c6b50">{formatPercentage(point.actual)}</text></>:null}</g>)}
        {points.filter(point=>isProjectSCurveWeeklyDate(point.date,points[0].date)).map(point=>{const labelX=x(point.date),labelY=HEIGHT-14;return <text key={`${point.date}-label`} x={labelX} y={labelY} transform={`rotate(-90 ${labelX} ${labelY})`} textAnchor="start" fontSize="10" fill="#617083">{formatCurveDate(point.date)}</text>})}
        <text x="16" y={TOP+plotHeight/2} transform={`rotate(-90 16 ${TOP+plotHeight/2})`} textAnchor="middle" fontSize="11" fontWeight="700" fill="#617083">Progress (%)</text>
      </svg>
    </div>
    <div className="mt-4 overflow-hidden rounded-xl border border-[#dfe7e3]"><table className="w-full min-w-[680px] text-left text-xs"><thead className="bg-[#f5f8f7] uppercase tracking-[.08em] text-[#617083]"><tr><th className="p-3.5">Discipline</th><th>Planned scope</th><th>Terminal issued</th><th>Terminal variance</th><th className="pr-3.5">Stage-weighted completion</th></tr></thead><tbody>{curve.disciplines.map(row=><tr className="border-t border-[#edf1ef]" key={row.discipline}><td className="p-3.5 font-semibold text-[#24384f]">{row.discipline}</td><td>{row.planned}</td><td>{row.completed}</td><td className={row.variance<0?"font-semibold text-[#a5452f]":"font-semibold text-[#0c5b45]"}>{row.variance>0?`+${row.variance}`:row.variance}</td><td className="pr-3.5"><div className="flex min-w-32 items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#e2e9e5]"><div className="h-full bg-[#0c5b45]" style={{width:`${row.completion_percent}%`}}/></div><b>{row.completion_percent}%</b></div></td></tr>)}</tbody></table></div>
  </>;
}

function Legend({colour,label}:{colour:string;label:string}){return <span className="inline-flex items-center gap-2"><span className="h-0.5 w-7 rounded" style={{backgroundColor:colour}}/>{label}</span>}
function formatCurveDate(value:string){return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{timeZone:"UTC",day:"2-digit",month:"short",year:"2-digit"})}
function formatPercentage(value:number){return `${Number.isInteger(value)?value:value.toFixed(1)}%`}
