import type {ReactNode} from "react";
import styles from "@/components/table-scroll-region.module.css";

type Props={label:string;children:ReactNode;className?:string;previewSafe?:boolean};

/** Keep native table semantics and browser scrolling; data and controls belong to the caller. */
export function TableScrollRegion({label,children,className="",previewSafe=false}:Props){
  return <div role="region" aria-label={label} tabIndex={0} data-preview-safe={previewSafe?"":undefined} className={`${styles.region} ${className}`}>{children}</div>;
}
