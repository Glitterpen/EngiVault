import { describe,expect,it } from "vitest";
import { canonicalUploadMime,hasExpectedMime,hasSupportedOrganisationLogoSignature,hasSupportedSignature,isNativeEngineeringFile,organisationLogoValidation,projectLogoValidation } from "./file-validation";

describe("engineering file validation",()=>{
  it("normalises DWG MIME because browsers report it inconsistently",()=>expect(canonicalUploadMime("layout.DWG","")).toBe("image/vnd.dwg"));
  it("requires extension and MIME to agree",()=>expect(hasExpectedMime("drawing.dwg","application/pdf")).toBe(false));
  it("recognises a DWG AC10 binary header",()=>expect(hasSupportedSignature("drawing.dwg",new Uint8Array([0x41,0x43,0x31,0x30,0x33,0x32]))).toBe(true));
  it("rejects a renamed executable",()=>expect(hasSupportedSignature("drawing.dwg",new Uint8Array([0x4d,0x5a,0x90,0x00]))).toBe(false));
  it("recognises only editable engineering source formats as native",()=>{
    expect(isNativeEngineeringFile("drawing.dwg")).toBe(true);
    expect(isNativeEngineeringFile("calculation.xlsx")).toBe(true);
    expect(isNativeEngineeringFile("report.docx")).toBe(true);
    expect(isNativeEngineeringFile("issued-copy.pdf")).toBe(false);
  });
});

describe("organisation logo validation",()=>{
  it("accepts a real PNG signature",()=>expect(hasSupportedOrganisationLogoSignature("image/png",new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))).toBe(true));
  it("accepts a WebP RIFF header",()=>expect(hasSupportedOrganisationLogoSignature("image/webp",new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]))).toBe(true));
  it("rejects SVG and renamed executable content",()=>expect(organisationLogoValidation(100,"image/svg+xml",new Uint8Array([0x3c,0x73,0x76,0x67]))).toContain("PNG"));
  it("rejects logos larger than 2 MB",()=>expect(organisationLogoValidation(2*1024*1024+1,"image/jpeg",new Uint8Array([0xff,0xd8,0xff]))).toContain("2 MB"));
});

describe("project client logo validation",()=>{
  it("accepts a client JPEG",()=>expect(projectLogoValidation(1_024,"image/jpeg",new Uint8Array([0xff,0xd8,0xff]))).toBeNull());
  it("rejects an oversized client logo",()=>expect(projectLogoValidation(2*1024*1024+1,"image/png",new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))).toContain("2 MB"));
  it("rejects disguised client logo content",()=>expect(projectLogoValidation(1_024,"image/jpeg",new Uint8Array([0x4d,0x5a]))).toContain("not a valid image"));
});
