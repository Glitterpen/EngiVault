import type {DocumentSchedule} from "@/lib/document-schedule";

export function DocumentIssueSchedule({schedule}:{schedule:DocumentSchedule}){
  const date=(value:string|null)=>value?new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}):"Not planned";
  return <div className="space-y-1 text-xs">
    <p className="text-[#617083]">First issue: {date(schedule.planned_submission_date)}</p>
    {schedule.last_issue_date&&<p className="text-[#617083]">Previous issue: {date(schedule.last_issue_date)}</p>}
    {schedule.deadline_kind==="next_revision"&&<p className="font-semibold">Next issue due: {date(schedule.next_submission_date)}</p>}
    {schedule.deadline_kind==="approved_change"&&<p className="font-semibold text-[#0c5b45]">Approved submission date: {date(schedule.next_submission_date)}</p>}
    {schedule.deadline_kind==="terminal_received"&&<p>Terminal issue received · no next revision scheduled</p>}
    {schedule.deadline_kind==="cycle_not_set"&&<p className="text-[#a5452f]">Project Manager to set revision cycle</p>}
    {schedule.revision_cycle_days&&<p className="text-[#617083]">Cycle: {schedule.revision_cycle_days} working days</p>}
    {schedule.overdue&&<span className="inline-block rounded bg-[#fff0e9] px-2 py-1 font-bold text-[#a5452f]">Overdue</span>}
  </div>;
}
