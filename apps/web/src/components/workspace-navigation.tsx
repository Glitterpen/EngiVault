"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useEffect,useId,useRef,useState} from "react";
import {Bell,Building2,ChartNoAxesColumnIncreasing,ClipboardCheck,FileSearch,FileStack,FileText,FolderKanban,LayoutDashboard,Menu,MessageSquareText,Package,Settings,ShieldCheck,UserCheck,Users,X} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {ProjectLogo} from "@/components/project-logo";
import {scopedRoleLabel,workspacePersona} from "@/lib/role-experience";
import {buildWorkspaceNavigation,type WorkspaceNavigationContext,type WorkspaceNavIcon,type WorkspaceNavItem} from "@/lib/workspace-navigation-model";
import styles from "./workspace-navigation.module.css";

type PreviewScope={organisationId:string;projectId:string;role:string;disciplines:string[]};
type Navigation=ReturnType<typeof buildWorkspaceNavigation>;
type IdentityProps={organisationId?:string;projectId?:string;context:WorkspaceNavigationContext|null};
const icons:Record<WorkspaceNavIcon,typeof Bell>={Bell,Building2,ChartNoAxesColumnIncreasing,ClipboardCheck,FileSearch,FileStack,FileText,FolderKanban,LayoutDashboard,MessageSquareText,Package,Settings,ShieldCheck,UserCheck,Users};
const uuid="[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function readContext(value:unknown,previewRole?:string):WorkspaceNavigationContext|null{
  if(!value||typeof value!=="object")return null;
  const data=value as Partial<WorkspaceNavigationContext>;
  if(typeof data.role!=="string"||!["organisation_admin","project_admin","document_controller","engineer","viewer","executive_viewer"].includes(data.role)
    ||typeof data.roleLabel!=="string"||!data.project||typeof data.project.code!=="string"||typeof data.project.name!=="string")return null;
  // Never replace a delegated member's menu with the administrator's context.
  if(previewRole?(data.role!==previewRole||data.preview!==true):data.preview===true)return null;
  return {role:data.role,roleLabel:data.roleLabel,persona:workspacePersona(data.role),project:data.project,
    pendingReviewCount:typeof data.pendingReviewCount==="number"&&Number.isFinite(data.pendingReviewCount)?Math.max(0,Math.floor(data.pendingReviewCount)):0,preview:Boolean(previewRole)};
}

export function WorkspaceNavigation({unreadCount=0,previewScope}:{unreadCount?:number;previewScope?:PreviewScope}){
  const pathname=usePathname();
  const match=pathname.match(new RegExp(`^/app/(${uuid})(?:/projects/(${uuid}))?(?:/|$)`,"i"));
  const organisationId=previewScope?.organisationId??match?.[1];
  const projectId=previewScope?.projectId??match?.[2];
  const previewRole=previewScope?.role;
  const scopeKey=`${organisationId??""}:${projectId??""}:${previewRole??"workspace"}`;
  const [scopedContext,setScopedContext]=useState<{key:string;value:WorkspaceNavigationContext|null}|null>(null);
  useEffect(()=>{
    if(!organisationId||!projectId)return;
    const controller=new AbortController();let request=0;
    const loadContext=async()=>{
      const current=++request;
      try{
        const response=await fetch(`/api/v1/organisations/${organisationId}/projects/${projectId}/workspace-context`,{cache:"no-store",signal:controller.signal});
        const value=response.ok?readContext(await response.json(),previewRole):null;
        if(!controller.signal.aborted&&current===request)setScopedContext({key:scopeKey,value});
      }catch{
        if(!controller.signal.aborted&&current===request)setScopedContext({key:scopeKey,value:null});
      }
    };
    void loadContext();
    const interval=window.setInterval(()=>void loadContext(),15000);
    window.addEventListener("focus",loadContext);
    return()=>{controller.abort();window.clearInterval(interval);window.removeEventListener("focus",loadContext);};
  },[organisationId,projectId,previewRole,scopeKey]);
  const fetched=scopedContext?.key===scopeKey?scopedContext.value:null;
  const context=fetched??(previewScope?{role:previewScope.role,roleLabel:scopedRoleLabel(previewScope.role,previewScope.disciplines),persona:workspacePersona(previewScope.role),project:{code:"",name:""},pendingReviewCount:0,preview:true}:null);
  const navigation=buildWorkspaceNavigation({pathname,organisationId,projectId,context,unreadCount});
  // Route changes unmount an open drawer instead of retaining an old page's overlay.
  return <WorkspaceSidebar key={pathname} organisationId={organisationId} projectId={projectId} context={context} navigation={navigation}/>;
}

function ProjectIdentity({organisationId,projectId,context}:IdentityProps){
  const name=context?.project.name||(projectId?"Project workspace":"Your workspace");
  return <div className={styles.identity}>
    <span className={styles.logo} aria-hidden="true">{organisationId&&projectId?<ProjectLogo organisationId={organisationId} projectId={projectId} name={name} size={44} className="size-full object-contain"/>:<FolderKanban size={23}/>}</span>
    <div className={styles.identityText}><p className={styles.projectCode}>{context?.project.code||(projectId?"Project":"EngiCite")}</p><p className={styles.projectName} title={name}>{name}</p></div>
    <div className={styles.roleRow}><span className={styles.role}>{context?.roleLabel??"Secure workspace"}</span>{context?.preview&&<span className={styles.preview}>Read-only preview</span>}</div>
  </div>;
}

function NavigationLink({item,activeKey,onNavigate}:{item:WorkspaceNavItem;activeKey:string;onNavigate?:()=>void}){
  const Icon=icons[item.icon];const selected=activeKey===item.key;
  return <Link href={item.href} onClick={onNavigate} aria-current={selected?"page":undefined} className={`${styles.link} ${selected?styles.active:""}`}>
    <Icon size={18} strokeWidth={1.7} aria-hidden="true" className={styles.linkIcon}/><span className={styles.linkLabel}>{item.label}</span>
    {Boolean(item.badge)&&<><span aria-hidden="true" className={styles.badge}>{item.badge!>99?"99+":item.badge}</span><span className="sr-only">{`, ${item.badge} ${item.key==="reviews"?"pending":"unread"}`}</span></>}
  </Link>;
}

function NavigationContents({navigation,onNavigate,label}:{navigation:Navigation;onNavigate?:()=>void;label:string}){
  const id=useId();const workspaceLinks=navigation.workspaceLinks.filter(item=>item.key!=="notifications");
  const notifications=navigation.workspaceLinks.find(item=>item.key==="notifications");
  return <nav aria-label={label} className={styles.navigation}>
    <div className={styles.scrollArea}>
      {workspaceLinks.length>0&&<div className={styles.workspaceLinks}>{workspaceLinks.map(item=><NavigationLink key={item.key} item={item} activeKey={navigation.activeKey} onNavigate={onNavigate}/>)}</div>}
      {navigation.groups.map(group=><section key={group.key} aria-labelledby={`${id}-${group.key}`} className={styles.group}>
        <h2 id={`${id}-${group.key}`} className={styles.groupTitle}>{group.label}</h2>
        <div className={styles.groupLinks}>{group.items.map(item=><NavigationLink key={item.key} item={item} activeKey={navigation.activeKey} onNavigate={onNavigate}/>)}</div>
      </section>)}
    </div>
    <div className={styles.footer}><div className={styles.footerLink}>{notifications&&<NavigationLink item={notifications} activeKey={navigation.activeKey} onNavigate={onNavigate}/>}</div><HelpTip label="Workspace role guidance">This workspace shows only the responsibilities assigned to your current role.</HelpTip></div>
  </nav>;
}

function WorkspaceSidebar({navigation,...identity}:IdentityProps&{navigation:Navigation}){
  const [open,setOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);const desktop=useRef<HTMLElement>(null);const menuId=useId();
  useEffect(()=>{
    if(!open)return;
    const modal=dialog.current;if(!modal)return;
    const opener=trigger.current,desktopSidebar=desktop.current;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow="hidden";
    if(!modal.open)modal.showModal();
    closeButton.current?.focus();
    const media=typeof window.matchMedia==="function"?window.matchMedia("(min-width: 768px)"):null;
    const closeForDesktop=()=>{if(media?.matches)setOpen(false);};
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!modal.contains(event.target)&&!trigger.current?.contains(event.target))setOpen(false);};
    const keydown=(event:KeyboardEvent)=>{
      if(event.defaultPrevented)return;
      if(event.key==="Escape"){event.preventDefault();setOpen(false);return;}
      if(event.key!=="Tab")return;
      const targets=Array.from(modal.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),[tabindex="0"]')).filter(item=>!item.closest("[hidden]"));
      const first=targets[0],last=targets.at(-1);
      if(event.shiftKey&&(document.activeElement===first||!modal.contains(document.activeElement))){event.preventDefault();last?.focus();}
      else if(!event.shiftKey&&(document.activeElement===last||!modal.contains(document.activeElement))){event.preventDefault();first?.focus();}
    };
    media?.addEventListener("change",closeForDesktop);
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",keydown);
    return()=>{
      media?.removeEventListener("change",closeForDesktop);
      document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",keydown);
      if(modal.open)modal.close();
      document.body.style.overflow=previousOverflow;
      if(opener?.isConnected){if(media?.matches)desktopSidebar?.querySelector<HTMLElement>('[aria-current="page"]')?.focus();else opener.focus();}
    };
  },[open]);
  return <>
    <div className={`sticky top-16 ${styles.mobileBar}`}><button ref={trigger} type="button" data-preview-safe aria-label="Toggle workspace navigation" aria-haspopup="dialog" aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(value=>!value)} className={styles.mobileTrigger}>
      <Menu size={21} aria-hidden="true"/><span className={styles.mobileTitle}><span className={styles.mobileProject}>{identity.context?.project.code||"Workspace"}</span><span className={styles.currentPage}>{navigation.currentLabel}</span></span><span className={styles.mobileOpenLabel} aria-hidden="true">Menu</span>
    </button></div>
    <aside ref={desktop} className={styles.sidebar} aria-label="Project sidebar"><ProjectIdentity {...identity}/><NavigationContents navigation={navigation} label="Workspace"/></aside>
    <dialog ref={dialog} id={menuId} role="dialog" aria-modal="true" aria-label="Project navigation" className={styles.drawer}
      onCancel={event=>{event.preventDefault();setOpen(false);}} onClose={()=>setOpen(false)}
      onClick={event=>{if(event.target!==event.currentTarget)return;const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setOpen(false);}}>
      {open&&<><div className={styles.drawerHeading}><span>Project navigation</span><button ref={closeButton} type="button" data-preview-safe aria-label="Close project navigation" onClick={()=>setOpen(false)} className={styles.closeButton}><X size={21} aria-hidden="true"/></button></div><ProjectIdentity {...identity}/><NavigationContents navigation={navigation} label="Mobile workspace" onNavigate={()=>setOpen(false)}/></>}
    </dialog>
  </>;
}
