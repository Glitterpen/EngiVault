import type {ReactNode} from "react";
import styles from "@/components/project-report-presentation.module.css";

/** Native horizontal scrolling remains reachable by keyboard without changing report data. */
export function ReportScrollRegion({label,children,className=""}:{label:string;children:ReactNode;className?:string}){
  return <div role="region" aria-label={`${label} — scroll horizontally`} tabIndex={0} data-preview-safe className={`${styles.scrollRegion} ${className}`}>{children}</div>;
}
