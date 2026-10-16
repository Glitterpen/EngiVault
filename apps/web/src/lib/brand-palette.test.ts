// @vitest-environment node
import {readFileSync,readdirSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {join,relative} from "node:path";
import {describe,expect,it} from "vitest";
import {disciplineFolderColour} from "./discipline-folder-colour";

const sourceRoot=fileURLToPath(new URL("..",import.meta.url));
function sourceFiles(directory:string):string[]{
  return readdirSync(directory,{withFileTypes:true}).flatMap(entry=>{
    const path=join(directory,entry.name);
    return entry.isDirectory()?sourceFiles(path):/\.(?:tsx?|css)$/.test(entry.name)&&!entry.name.includes(".test.")?[path]:[];
  });
}
function isGreen([r,g,b]:number[]):boolean{
  const high=Math.max(r,g,b),low=Math.min(r,g,b),delta=high-low;
  if(delta<3)return false;
  let hue=high===r?(g-b)/delta:high===g?(b-r)/delta+2:(r-g)/delta+4;
  hue=(hue*60+360)%360;
  return hue>=70&&hue<=195;
}
function channels(hex:string):number[]{
  const full=hex.length===3?hex.split("").map(value=>value+value).join(""):hex;
  return full.match(/../g)!.map(value=>parseInt(value,16));
}
function contrast(foreground:string,background:string):number{
  const luminance=(hex:string)=>channels(hex.slice(1)).map(value=>value/255).map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4).reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
  const values=[luminance(foreground),luminance(background)].sort((a,b)=>b-a);
  return (values[0]+.05)/(values[1]+.05);
}

describe("logo-aligned application palette",()=>{
  it("does not reintroduce green or teal accents in page, component, chart, email or report source",()=>{
    const violations:string[]=[];
    for(const file of sourceFiles(sourceRoot)){
      const source=readFileSync(file,"utf8"),name=relative(sourceRoot,file);
      for(const match of source.matchAll(/#([a-f\d]{6}|[a-f\d]{3})(?![a-f\d])/gi))if(isGreen(channels(match[1])))violations.push(`${name}: ${match[0]}`);
      for(const match of source.matchAll(/rgba?\((\d*\.?\d+(?:\s*\/\s*255)?)[,\s]+(\d*\.?\d+(?:\s*\/\s*255)?)[,\s]+(\d*\.?\d+(?:\s*\/\s*255)?)/gi)){
        const rgb=match.slice(1).map(value=>value.includes("/")?parseFloat(value):parseFloat(value)*(file.endsWith(".css")?1:255));
        if(isGreen(rgb))violations.push(`${name}: ${match[0]}`);
      }
      for(const match of source.matchAll(/\b(?:bg|text|border|ring|outline|accent|stroke|fill|from|via|to|decoration|shadow)-(?:green|emerald|teal|lime)(?:-\d+)?\b/g))violations.push(`${name}: ${match[0]}`);
    }
    expect([...new Set(violations)]).toEqual([]);
  });

  it("keeps navy status text and primary orange actions readable",()=>{
    expect(contrast("#24384f","#eef3fa")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff","#b94d20")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff","#a64019")).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#10243e","#ffffff")).toBeGreaterThanOrEqual(3);
  });

  it("shows hidden file-input focus on the visible picker and uses a contrasting help outline",()=>{
    const css=readFileSync(join(sourceRoot,"app/globals.css"),"utf8");
    expect(css).toContain('.ev-file-picker:has(input[type="file"]:focus-visible)');
    expect(css).toMatch(/\.ev-file-picker:has\(input\[type="file"\]:focus-visible\)\s*\{[^}]*outline: 3px solid var\(--focus\)/);
    expect(css).toMatch(/\.ev-help-trigger:focus-visible\s*\{[^}]*outline: 3px solid var\(--focus\)/);
    expect(contrast("#10243e","#f4f7fb")).toBeGreaterThanOrEqual(3);
  });

  it("keeps delivery series distinct and visible against the chart background",()=>{
    const series=["#647386","#b94d20","#10243e"];
    expect(new Set(series).size).toBe(3);
    for(const colour of series)expect(contrast(colour,"#f7f9fc")).toBeGreaterThanOrEqual(3);
    const component=readFileSync(join(sourceRoot,"components/project-delivery-curve.tsx"),"utf8");
    const styles=readFileSync(join(sourceRoot,"components/project-delivery-curve.module.css"),"utf8");
    for(const [name,colour] of [["planned","#647386"],["submitted","#b94d20"],["accepted","#10243e"]]){
      expect(component).toMatch(new RegExp(`data-curve-series="${name}"[^>]*stroke="${colour}"`));
      expect(styles).toMatch(new RegExp(`\\.${name}Key \\{ border-top: [^;]+${colour}; \\}`));
    }
    expect(component).toContain('strokeDasharray="10 4"');
    expect(component).toContain('strokeDasharray="6 6"');
    expect(component).toContain("Slate dashed estimated plan");
    expect(component).toContain("Orange dashed overall submitted progress and navy solid DCC-accepted progress");
  });

  it("keeps discipline folder accents within the navy, orange and slate families",()=>{
    for(const discipline of ["Electrical","Fire & Gas","Instrumentation","Mechanical","Process","Project","Subsea / Pipeline","Piping","Structural","Civil","Telecommunications","Technical Safety","Custom engineering"]){
      const colour=disciplineFolderColour(discipline),[r,g,b]=channels(colour.slice(1));
      expect(isGreen([r,g,b])).toBe(false);
      expect(r>=g&&g>=b||b>=g&&g>=r).toBe(true);
      expect(contrast(colour,"#ffffff")).toBeGreaterThanOrEqual(3);
    }
  });
});
