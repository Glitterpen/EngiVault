"use client";

import Link from "next/link";
import {usePathname} from "next/navigation";
import {useCallback,useEffect,useId,useLayoutEffect,useRef,useState,type ReactNode} from "react";
import {Bell,Building2,ChartNoAxesColumnIncreasing,ClipboardCheck,Eye,FileSearch,FileStack,FileText,FolderKanban,LayoutDashboard,Menu,MessageSquareText,Package,PanelLeftClose,PanelLeftOpen,Settings,ShieldCheck,UserCheck,Users,X} from "lucide-react";
import {HelpTip} from "@/components/help-tip";
import {ProjectLogo} from "@/components/project-logo";
import {scopedRoleLabel,workspacePersona} from "@/lib/role-experience";
import {buildWorkspaceNavigation,type WorkspaceNavigationContext,type WorkspaceNavIcon,type WorkspaceNavItem} from "@/lib/workspace-navigation-model";
import styles from "./workspace-navigation.module.css";

type PreviewScope={organisationId:string;projectId:string;role:string;disciplines:string[]};
type Navigation=ReturnType<typeof buildWorkspaceNavigation>;
type IdentityProps={organisationId?:string;projectId?:string;context:WorkspaceNavigationContext|null};
type WorkspaceChrome={brand:ReactNode;account:ReactNode};
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

export function WorkspaceNavigation({unreadCount=0,previewScope,chrome,children}:{unreadCount?:number;previewScope?:PreviewScope;chrome?:WorkspaceChrome;children?:ReactNode}){
  const pathname=usePathname();
  const match=pathname.match(new RegExp(`^/app/(${uuid})(?:/projects/(${uuid}))?(?:/|$)`,"i"));
  const organisationId=previewScope?.organisationId??match?.[1];
  const projectId=previewScope?.projectId??match?.[2];
  const previewRole=previewScope?.role;
  const scopeKey=`${organisationId??""}:${projectId??""}:${previewRole??"workspace"}`;
  const [scopedContext,setScopedContext]=useState<{key:string;value:WorkspaceNavigationContext|null}|null>(null);
  // Keep desktop density independent of the route-keyed mobile drawer.
  const [collapsed,setCollapsed]=useState(false);
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
  const sidebar=<WorkspaceSidebar key={pathname} organisationId={organisationId} projectId={projectId} context={context} navigation={navigation} collapsed={collapsed} onToggleCollapsed={()=>setCollapsed(value=>!value)} chrome={chrome} unreadCount={unreadCount}/>;
  // Server-rendered page slots stay outside the keyed drawer: opening menus or
  // refreshing header context must never remount an upload or discard a draft.
  return chrome?<>{sidebar}<div className={styles.workspaceFrame}>{children}</div></>:sidebar;
}

function ProjectIdentity({organisationId,projectId,context}:IdentityProps){
  const name=context?.project.name||(projectId?"Project workspace":"Your workspace");
  return <div className={styles.identity}>
    <span className={styles.logo} aria-hidden="true">{organisationId&&projectId?<ProjectLogo organisationId={organisationId} projectId={projectId} name={name} size={44} className="size-full object-contain"/>:<FolderKanban size={23}/>}</span>
    <div className={styles.identityText}><p className={styles.projectCode}>{context?.project.code||(projectId?"Project":"EngiCite")}</p><p className={styles.projectName} title={name}>{name}</p></div>
    <div className={styles.roleRow}><span className={styles.role}>{context?.roleLabel??"Secure workspace"}</span>{context?.preview&&<span className={styles.preview} title="Read-only preview"><Eye size={14} aria-hidden="true" className={styles.previewIcon}/><span className={styles.previewLabel}>Read-only preview</span></span>}</div>
  </div>;
}

function NavigationLink({item,activeKey,onNavigate,compact=false}:{item:WorkspaceNavItem;activeKey:string;onNavigate?:()=>void;compact?:boolean}){
  const Icon=icons[item.icon];const selected=activeKey===item.key;
  const id=useId(),anchor=useRef<HTMLAnchorElement>(null),popup=useRef<HTMLSpanElement>(null);
  const closeTimer=useRef<ReturnType<typeof setTimeout>|null>(null);
  const [tooltipOpen,setTooltipOpen]=useState(false);
  const cancelClose=useCallback(()=>{if(closeTimer.current)clearTimeout(closeTimer.current);},[]);
  const close=useCallback(()=>{cancelClose();setTooltipOpen(false);},[cancelClose]);
  const show=()=>{if(compact&&window.innerWidth>=768){cancelClose();setTooltipOpen(true);}};
  const leave=()=>{cancelClose();closeTimer.current=setTimeout(()=>{if(document.activeElement!==anchor.current)setTooltipOpen(false);},150);};
  useEffect(()=>()=>{if(closeTimer.current)clearTimeout(closeTimer.current);},[]);
  useLayoutEffect(()=>{
    if(!tooltipOpen)return;
    const tip=popup.current;if(!tip)return;
    // A top-layer tooltip is not clipped by the sidebar's scrolling link list.
    if(typeof tip.showPopover==="function")tip.showPopover();else tip.removeAttribute("popover");
    const position=()=>{
      if(window.innerWidth<768){close();return;}
      const box=anchor.current?.getBoundingClientRect();if(!box)return;
      const bounds=tip.getBoundingClientRect();
      tip.style.left=`${Math.max(8,Math.min(box.right+12,window.innerWidth-bounds.width-8))}px`;
      tip.style.top=`${Math.max(8,Math.min(box.top+(box.height-bounds.height)/2,window.innerHeight-bounds.height-8))}px`;
    };
    position();
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!anchor.current?.contains(event.target)&&!tip.contains(event.target))close();};
    const escape=(event:KeyboardEvent)=>{if(event.key==="Escape"){event.preventDefault();event.stopPropagation();close();}};
    document.addEventListener("pointerdown",outside);document.addEventListener("keydown",escape,true);
    window.addEventListener("resize",position);window.addEventListener("scroll",position,true);
    return()=>{
      document.removeEventListener("pointerdown",outside);document.removeEventListener("keydown",escape,true);
      window.removeEventListener("resize",position);window.removeEventListener("scroll",position,true);
    };
  },[tooltipOpen,close]);
  return <><Link ref={anchor} href={item.href} onClick={onNavigate} aria-current={selected?"page":undefined} aria-describedby={tooltipOpen?id:undefined} className={`${styles.link} ${selected?styles.active:""}`}
    onMouseEnter={show} onMouseLeave={leave} onFocus={show} onBlur={close}>
    <Icon size={18} strokeWidth={1.7} aria-hidden="true" className={styles.linkIcon}/><span className={styles.linkLabel}>{item.label}</span>
    {Boolean(item.badge)&&<><span aria-hidden="true" className={styles.badge}>{item.badge!>99?"99+":item.badge}</span><span className="sr-only">{`, ${item.badge} ${item.key==="reviews"?"pending":"unread"}`}</span></>}
  </Link>{tooltipOpen&&<span ref={popup} id={id} role="tooltip" popover="manual" className={styles.railTooltip} onMouseEnter={show} onMouseLeave={leave}>{item.label}</span>}</>;
}

function NavigationContents({navigation,onNavigate,label,id:navId,compact=false}:{navigation:Navigation;onNavigate?:()=>void;label:string;id?:string;compact?:boolean}){
  const id=useId();const workspaceLinks=navigation.workspaceLinks.filter(item=>item.key!=="notifications");
  const notifications=navigation.workspaceLinks.find(item=>item.key==="notifications");
  return <nav id={navId} aria-label={label} className={styles.navigation}>
    <div className={styles.scrollArea}>
      {workspaceLinks.length>0&&<div className={styles.workspaceLinks}>{workspaceLinks.map(item=><NavigationLink key={`${item.key}-${compact}`} item={item} activeKey={navigation.activeKey} onNavigate={onNavigate} compact={compact}/>)}</div>}
      {navigation.groups.map(group=><section key={group.key} aria-labelledby={`${id}-${group.key}`} className={styles.group}>
        <h2 id={`${id}-${group.key}`} className={styles.groupTitle}>{group.label}</h2>
        <div className={styles.groupLinks}>{group.items.map(item=><NavigationLink key={`${item.key}-${compact}`} item={item} activeKey={navigation.activeKey} onNavigate={onNavigate} compact={compact}/>)}</div>
      </section>)}
    </div>
    <div className={styles.footer}><div className={styles.footerLink}>{notifications&&<NavigationLink key={`${notifications.key}-${compact}`} item={notifications} activeKey={navigation.activeKey} onNavigate={onNavigate} compact={compact}/>}</div><HelpTip label="Workspace role guidance">This workspace shows only the responsibilities assigned to your current role.</HelpTip></div>
  </nav>;
}

function WorkspaceSidebar({navigation,collapsed,onToggleCollapsed,chrome,unreadCount,...identity}:IdentityProps&{navigation:Navigation;collapsed:boolean;onToggleCollapsed:()=>void;chrome?:WorkspaceChrome;unreadCount:number}){
  const [open,setOpen]=useState(false);const dialog=useRef<HTMLDialogElement>(null);const trigger=useRef<HTMLButtonElement>(null);
  const closeButton=useRef<HTMLButtonElement>(null);const desktop=useRef<HTMLElement>(null);const menuId=useId(),desktopNavId=useId();
  const CollapseIcon=collapsed?PanelLeftOpen:PanelLeftClose;
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
    {chrome?<header className={`workspace-topbar ${styles.topbar}`}><div className={`workspace-header-inner ${styles.topbarInner}`}>
      <button ref={trigger} type="button" data-preview-safe aria-label="Toggle workspace navigation" aria-haspopup="dialog" aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(value=>!value)} className={styles.headerMenu}><Menu size={21} aria-hidden="true"/></button>
      <div className={styles.brandSlot}>{chrome.brand}</div>
      <nav aria-label="Current location" className={styles.headerContext}><ol>
        <li className={styles.headerProject} title={identity.context?.project.name||undefined}>{identity.context?.project.code||(identity.projectId?"Project workspace":identity.organisationId?"Organisation":"Workspace")}{identity.context?.project.name&&<span className="sr-only">{` — ${identity.context.project.name}`}</span>}</li>
        <li aria-current="page" className={styles.headerPage}>{navigation.currentLabel}</li>
      </ol></nav>
      <div className={styles.headerActions}>
        <Link href="/app/notifications" aria-label={`Notifications, ${unreadCount} unread`} aria-current={navigation.activeKey==="notifications"?"page":undefined} className={styles.notificationLink}><Bell size={19} aria-hidden="true"/>{unreadCount>0&&<span className={styles.notificationBadge} aria-hidden="true">{unreadCount>99?"99+":unreadCount}</span>}</Link>
        <div className={styles.accountSlot}>{chrome.account}</div>
      </div>
    </div></header>:<div className={`sticky top-16 ${styles.mobileBar}`}><button ref={trigger} type="button" data-preview-safe aria-label="Toggle workspace navigation" aria-haspopup="dialog" aria-expanded={open} aria-controls={menuId} onClick={()=>setOpen(value=>!value)} className={styles.mobileTrigger}>
      <Menu size={21} aria-hidden="true"/><span className={styles.mobileTitle}><span className={styles.mobileProject}>{identity.context?.project.code||"Workspace"}</span><span className={styles.currentPage}>{navigation.currentLabel}</span></span><span className={styles.mobileOpenLabel} aria-hidden="true">Menu</span>
    </button></div>}
    <aside ref={desktop} className={styles.sidebar} data-collapsed={collapsed} aria-label="Project sidebar"><ProjectIdentity {...identity}/><NavigationContents navigation={navigation} label="Workspace" id={desktopNavId} compact={collapsed}/>
      <button type="button" data-preview-safe className={styles.collapseToggle} onClick={onToggleCollapsed} aria-label={collapsed?"Expand sidebar":"Collapse sidebar"} aria-expanded={!collapsed} aria-controls={desktopNavId} title={collapsed?"Expand sidebar":"Collapse sidebar"}>
        <CollapseIcon size={19} aria-hidden="true"/><span className={styles.collapseLabel}>{collapsed?"Expand sidebar":"Collapse sidebar"}</span>
      </button>
    </aside>
    <dialog ref={dialog} id={menuId} role="dialog" aria-modal="true" aria-label="Project navigation" className={styles.drawer}
      onCancel={event=>{event.preventDefault();setOpen(false);}} onClose={()=>setOpen(false)}
      onClick={event=>{if(event.target!==event.currentTarget)return;const box=event.currentTarget.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom)setOpen(false);}}>
      {open&&<><div className={styles.drawerHeading}><span>Project navigation</span><button ref={closeButton} type="button" data-preview-safe aria-label="Close project navigation" onClick={()=>setOpen(false)} className={styles.closeButton}><X size={21} aria-hidden="true"/></button></div><ProjectIdentity {...identity}/><NavigationContents navigation={navigation} label="Mobile workspace" onNavigate={()=>setOpen(false)}/></>}
    </dialog>
  </>;
}
