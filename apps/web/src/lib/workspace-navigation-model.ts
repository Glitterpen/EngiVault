import {workspacePersona,type WorkspacePersona} from "./role-experience";

export type WorkspaceNavigationContext={role:string;roleLabel:string;persona:WorkspacePersona;project:{code:string;name:string};pendingReviewCount:number;preview?:boolean};
export type WorkspaceNavIcon="Bell"|"Building2"|"ChartNoAxesColumnIncreasing"|"ClipboardCheck"|"FileSearch"|"FileStack"|"FileText"|"FolderKanban"|"LayoutDashboard"|"MessageSquareText"|"Package"|"Settings"|"ShieldCheck"|"UserCheck"|"Users";
export type WorkspaceNavItem={key:string;href:string;label:string;icon:WorkspaceNavIcon;badge?:number};
export type WorkspaceNavGroup={key:"daily"|"tools"|"administration";label:string;items:WorkspaceNavItem[]};
type Input={pathname:string;organisationId?:string;projectId?:string;context:WorkspaceNavigationContext|null;unreadCount:number};

function countBadge(value:unknown):number|undefined{
  return typeof value==="number"&&Number.isFinite(value)&&value>=1?Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value)):undefined;
}
function routeKey(pathname:string,base:string,homeKey:string):string{
  const path=pathname.split(/[?#]/,1)[0].replace(/\/+$/,"")||"/";
  if(path==="/app")return "organisations";
  if(path==="/app/notifications"||path.startsWith("/app/notifications/"))return "notifications";
  const page=base&&path===base?"":base&&path.startsWith(base+"/")?path.slice(base.length).split("/")[1]:null;
  if(page==="")return homeKey;
  const projectKeys:Record<string,string>={overview:"overview",control:"control",reviews:"reviews",reports:"reports",team:"team",assignments:"assignments","work-packages":"packages",progress:"progress",search:"search",chat:"chat",administration:"administration",settings:"settings",documents:"documents",templates:"templates",interdisciplinary:"interdisciplinary",requests:"requests"};
  if(page&&projectKeys[page])return projectKeys[page];
  if(path==="/app/documents"||path.startsWith("/app/documents/"))return "documents";
  return "projects";
}

/** Presentation only: all destinations keep their existing server-side role checks. */
export function buildWorkspaceNavigation({pathname,organisationId,projectId,context,unreadCount}:Input){
  const preview=Boolean(context?.preview),scoped=Boolean(organisationId&&projectId);
  const base=scoped?`/app/${organisationId}/projects/${projectId}`:"";
  const persona=context?workspacePersona(context.role):null;
  const workspaceLinks:WorkspaceNavItem[]=[];
  if(!preview){
    workspaceLinks.push({key:"organisations",href:"/app",label:"Organisations",icon:"Building2"});
    workspaceLinks.push({key:"projects",href:organisationId?`/app/${organisationId}`:"/app/projects",label:scoped?(persona==="management"?"All projects":"My projects"):"Projects",icon:"FolderKanban"});
  }
  // Notifications remain available in audited member preview, as before.
  workspaceLinks.push({key:"notifications",href:"/app/notifications",label:"Notifications",icon:"Bell",badge:countBadge(unreadCount)});
  const groups:WorkspaceNavGroup[]=[];
  let homeKey="projects";
  if(scoped&&context){
    const item=(key:string,suffix:string,label:string,icon:WorkspaceNavIcon,badge?:number):WorkspaceNavItem=>({key,href:`${base}/${suffix}`,label,icon,...(badge===undefined?{}:{badge})});
    const requests=item("requests","requests","Requests","ClipboardCheck");
    const templates=item("templates","templates","Templates","Package");
    const references=item("interdisciplinary","interdisciplinary","Interdisciplinary check","FileSearch");
    const overview=item("overview","overview","Overview","LayoutDashboard");
    const progress=item("progress","progress","Progress & health","ChartNoAxesColumnIncreasing");
    const reports=item("reports","reports","Reports","FileText");
    const daily:WorkspaceNavItem[]=[],tools:WorkspaceNavItem[]=[],administration:WorkspaceNavItem[]=[];
    if(persona==="management"){
      homeKey="overview";
      daily.push(overview,progress,reports);
      tools.push(templates,references);
      administration.push(item("team","team",context.role==="organisation_admin"?"Appointments":"Team & resources","Users"));
      if(context.role==="organisation_admin")administration.push(item("administration","administration","Admin controls","ShieldCheck"));
      if(context.role==="project_admin"){
        daily.push(requests);
        administration.push(item("settings","settings","Project settings","Settings"));
      }
    }else if(persona==="document_control"){
      homeKey="control";
      daily.push(item("control","control","Control centre","LayoutDashboard"),item("documents","documents","MDR","FileStack"),item("reviews","reviews","Reviews","ClipboardCheck",countBadge(context.pendingReviewCount)),requests,item("packages","work-packages","Work packages","Package"));
      tools.push(templates,references,item("team","team","Discipline engineers","Users"),progress);
    }else if(persona==="engineering"){
      homeKey="assignments";
      daily.push(item("assignments","assignments","Deliverables","UserCheck"),requests);
      tools.push(templates,references,item("search","search","Engineering search","FileSearch"),item("chat","chat","Ask EngiCite","MessageSquareText"));
    }else{
      // Retain the existing viewer destinations and labels without new tools.
      homeKey="documents";
      daily.push(item("documents","documents","Project documents","FileStack"));
      tools.push(item("search","search","Evidence search","FileSearch"),{...templates,label:"Project templates"},references);
    }
    for(const [key,label,items] of [["daily","Daily work",daily],["tools","Project tools",tools],["administration","Administration",administration]] as const){
      if(items.length)groups.push({key,label,items});
    }
  }
  const activeKey=routeKey(pathname,base,homeKey);
  const currentLabel=[...workspaceLinks,...groups.flatMap(group=>group.items)].find(item=>item.key===activeKey)?.label??"Workspace";
  return {workspaceLinks,groups,activeKey,currentLabel};
}
