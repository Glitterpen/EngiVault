import type {ReactNode} from "react";
import {CircleAlert,Inbox,LoaderCircle} from "lucide-react";
import styles from "./page-state.module.css";

type PageStateProps={
  kind:"empty"|"error"|"loading";
  title:string;
  children?:ReactNode;
  actions?:ReactNode;
  headingLevel?:1|2|3;
  className?:string;
};

/** Presentation only: callers distinguish a failed read from an empty result. */
export function PageState({kind,title,children,actions,headingLevel=2,className=""}:PageStateProps){
  const Heading=headingLevel===1?"h1":headingLevel===3?"h3":"h2";
  const Icon=kind==="error"?CircleAlert:kind==="loading"?LoaderCircle:Inbox;
  return <section role={kind==="error"?"alert":kind==="loading"?"status":undefined} aria-atomic={kind==="empty"?undefined:true} className={`${styles.state} ${styles[kind]} ${className}`.trim()}>
    <span className={styles.icon}><Icon size={22} aria-hidden="true"/></span>
    <div className={styles.content}>
      <Heading className={styles.title}>{title}</Heading>
      {children&&<div className={styles.description}>{children}</div>}
      {actions&&<div className={styles.actions}>{actions}</div>}
    </div>
  </section>;
}
