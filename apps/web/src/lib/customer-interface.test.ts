// @vitest-environment node
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { expect, it } from "vitest";

const internalPlatform = /supabase|vercel|railway|openai|cloudflare|turnstile|clamav|postgrest|postgresql|fastapi|engivault/i;
function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.tsx?$/.test(file) && !file.includes(".test.") ? [file] : [];
  });
}

it("keeps app-owned screen copy and accessible labels free of internal platform branding", () => {
  const findings: string[] = [];
  const files = [...sources("src/app"), ...sources("src/components")];
  for (const file of files) {
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true);
    function visit(node: ts.Node) {
      if (ts.isStringLiteralLike(node) || ts.isJsxText(node) || ts.isTemplateHead(node) || ts.isTemplateMiddle(node) || ts.isTemplateTail(node)) {
        const text = node.text.trim();
        // Import specifiers and the security widget's exact integration attributes
        // are executable wiring, not our UI wording. Do not mask its own branding.
        const widgetAttribute = file.endsWith("auth-turnstile.tsx") && ts.isJsxAttribute(node.parent)
          && ["id", "src"].includes(node.parent.name.getText(source));
        if (!ts.isImportDeclaration(node.parent) && !ts.isLiteralTypeNode(node.parent) && !widgetAttribute && internalPlatform.test(text)) {
          findings.push(`${file}:${source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1}: ${text}`);
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(files.length).toBeGreaterThan(100);
  expect(findings).toEqual([]);
});

it("keeps shipped email copy and public starter assets branded for EngiCite", () => {
  const template = readFileSync("../../supabase/templates/confirmation.html", "utf8");
  expect(template).not.toMatch(internalPlatform);
  expect(existsSync("public/vercel.svg")).toBe(false);
  expect(existsSync("public/next.svg")).toBe(false);
});
