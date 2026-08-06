import { describe,expect,it } from "vitest";
import { canonicalUploadMime,hasExpectedMime,hasSupportedSignature } from "./file-validation";

describe("engineering file validation",()=>{
  it("normalises DWG MIME because browsers report it inconsistently",()=>expect(canonicalUploadMime("layout.DWG","")).toBe("image/vnd.dwg"));
  it("requires extension and MIME to agree",()=>expect(hasExpectedMime("drawing.dwg","application/pdf")).toBe(false));
  it("recognises a DWG AC10 binary header",()=>expect(hasSupportedSignature("drawing.dwg",new Uint8Array([0x41,0x43,0x31,0x30,0x33,0x32]))).toBe(true));
  it("rejects a renamed executable",()=>expect(hasSupportedSignature("drawing.dwg",new Uint8Array([0x4d,0x5a,0x90,0x00]))).toBe(false));
});
