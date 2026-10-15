import {describe,expect,it} from "vitest";
import {disciplineFolderColour} from "./discipline-folder-colour";

describe("discipline folder colours",()=>{
  it("gives the current project disciplines distinct stable accents",()=>{
    const names=["Electrical","Fire & Gas","Instrumentation","Mechanical","Process","Project","Subsea / Pipeline"];
    expect(new Set(names.map(disciplineFolderColour)).size).toBe(names.length);
    expect(disciplineFolderColour(" Electrical ")).toBe(disciplineFolderColour("electrical"));
  });
  it("provides a deterministic safe accent for custom disciplines",()=>{
    expect(disciplineFolderColour("Custom engineering")).toMatch(/^#[a-f0-9]{6}$/);
    expect(disciplineFolderColour("Custom engineering")).toBe(disciplineFolderColour("CUSTOM  ENGINEERING"));
    expect(disciplineFolderColour("<script>alert(1)</script>")).toMatch(/^#[a-f0-9]{6}$/);
    expect(disciplineFolderColour("")).toMatch(/^#[a-f0-9]{6}$/);
  });
  it("keeps icon contrast above 3:1 against white",()=>{
    const luminance=(hex:string)=>{
      const channels=hex.slice(1).match(/../g)!.map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4);
      return channels[0]*0.2126+channels[1]*0.7152+channels[2]*0.0722;
    };
    for(const name of ["Electrical","Fire & Gas","Instrumentation","Mechanical","Process","Project","Subsea / Pipeline","Piping","Structural","Civil","Telecommunications","Technical Safety"]){
      expect(1.05/(luminance(disciplineFolderColour(name))+0.05)).toBeGreaterThan(3);
    }
  });
});
