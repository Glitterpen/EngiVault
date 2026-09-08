import {normaliseDiscipline} from "@/lib/discipline-access";

export type DisciplineAssignmentEngineer={userId:string;name:string;email:string;disciplines:string[]};
export type DisciplineAssignmentScope={name:string;documentCount:number;engineers:(DisciplineAssignmentEngineer&{assignedCount:number;remainingCount:number})[]};
export type AssignmentDocument={id:string;discipline:string};
export type ActiveDocumentAssignment={document_id:string;user_id:string};

// These are already project-scoped active rows read using the current user's
// client. Keep each engineer/discipline allocation separate: one work email can
// be fully assigned Electrical while still awaiting Instrumentation documents.
export function buildDisciplineAssignmentScopes(documents:AssignmentDocument[],assignments:ActiveDocumentAssignment[],engineers:DisciplineAssignmentEngineer[]):DisciplineAssignmentScope[]{
  const groups=new Map<string,{name:string;ids:Set<string>}>();
  for(const document of documents){
    const key=normaliseDiscipline(document.discipline);
    const group=groups.get(key)??{name:document.discipline,ids:new Set<string>()};
    group.ids.add(document.id);groups.set(key,group);
  }
  const assignedByUser=new Map<string,Set<string>>();
  for(const assignment of assignments){
    const ids=assignedByUser.get(assignment.user_id)??new Set<string>();
    ids.add(assignment.document_id);assignedByUser.set(assignment.user_id,ids);
  }
  return [...groups].map(([key,group])=>({
    name:group.name,documentCount:group.ids.size,
    engineers:engineers.filter(engineer=>engineer.disciplines.some(value=>normaliseDiscipline(value)===key)).map(engineer=>{
      const assigned=assignedByUser.get(engineer.userId);
      const assignedCount=[...group.ids].filter(id=>assigned?.has(id)).length;
      return {...engineer,assignedCount,remainingCount:group.ids.size-assignedCount};
    }),
  })).sort((left,right)=>left.name.localeCompare(right.name));
}
