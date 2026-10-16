import {cleanup,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it} from "vitest";
import {StatusBadge,type StatusBadgeTone} from "./status-badge";

afterEach(cleanup);
const tones:StatusBadgeTone[]=["neutral","info","success","warning","danger"];

function contrast(foreground:string,background:string){
  const luminance=(hex:string)=>[1,3,5].map(index=>parseInt(hex.slice(index,index+2),16)/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const values=[luminance(foreground),luminance(background)].sort((left,right)=>right-left);
  return (values[0]+.05)/(values[1]+.05);
}

describe("StatusBadge",()=>{
  it.each(tones)("uses consistent compact readable spacing and wrapping for explicit %s tone",tone=>{
    render(<StatusBadge tone={tone}>Status label</StatusBadge>);
    const badge=screen.getByText("Status label");
    expect(badge.tagName).toBe("SPAN");
    for(const token of ["inline-flex","max-w-full","rounded-md","border","px-2.5","py-0.5","text-xs","font-medium","leading-5","whitespace-normal","[overflow-wrap:anywhere]"])expect(badge.classList.contains(token)).toBe(true);
    const foreground=badge.className.match(/text-\[(#[0-9a-f]{6})\]/)![1];
    const background=badge.className.match(/bg-\[(#[0-9a-f]{6})\]/)![1];
    expect(contrast(foreground,background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["Ready","Transmitted","Submitted","Frozen · awaiting ZIP"])("preserves exact domain label %s without inferring its meaning or announcing every badge",label=>{
    render(<StatusBadge>{label}</StatusBadge>);
    const badge=screen.getByText(label);
    expect(badge.textContent).toBe(label);
    expect(badge.className).toContain("bg-[#f3f6f9]");
    expect(badge.hasAttribute("role")).toBe(false);
    expect(badge.hasAttribute("aria-live")).toBe(false);
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("uses only the caller's explicit tone, not a guessed status mapping",()=>{
    render(<StatusBadge tone="warning">Ready</StatusBadge>);
    const badge=screen.getByText("Ready");
    expect(badge.className).toContain("bg-[#fff2e9]");
    expect(badge.className).not.toContain("bg-[#edf2f8]");
    expect(badge.textContent).toBe("Ready");
  });

  it("supports caller attributes, extra classes and decorative content without adding interactivity",()=>{
    render(<StatusBadge tone="info" className="capitalize" title="Secure processing"><svg aria-hidden="true"/><span>pending validation</span></StatusBadge>);
    const badge=screen.getByTitle("Secure processing");
    expect(badge.textContent).toBe("pending validation");
    expect(badge.className).toContain("capitalize");
    expect(badge.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(badge.hasAttribute("tabindex")).toBe(false);
    expect(screen.queryByRole("button")).toBeNull();
  });
});
