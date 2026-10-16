import {afterEach,describe,expect,it} from "vitest";
import {cleanup,render,screen} from "@testing-library/react";
import Link from "next/link";
import {FormFeedback} from "./form-feedback";

afterEach(cleanup);

describe("explicit form feedback",()=>{
  it.each(["success","info"] as const)("announces %s feedback politely without an error alert",tone=>{
    render(<FormFeedback tone={tone}>The project information is available.</FormFeedback>);
    expect(screen.getByRole("status").textContent).toBe("The project information is available.");expect(screen.getByRole("status").getAttribute("aria-atomic")).toBe("true");expect(screen.queryByRole("alert")).toBeNull();
  });
  it("announces explicitly supplied errors as alerts",()=>{
    render(<FormFeedback tone="error">The project could not be saved.</FormFeedback>);
    expect(screen.getByRole("alert").textContent).toBe("The project could not be saved.");expect(screen.queryByRole("status")).toBeNull();
  });
  it("does not infer success or failure from message text",()=>{
    const view=render(<FormFeedback tone="error">Saved successfully.</FormFeedback>);expect(screen.getByRole("alert")).toBeTruthy();
    view.rerender(<FormFeedback tone="success">An error was noted in the review history.</FormFeedback>);expect(screen.getByRole("status")).toBeTruthy();expect(screen.queryByRole("alert")).toBeNull();
  });
  it("preserves caller content, IDs and links while allowing narrow reflow",()=>{
    render(<FormFeedback id="project-feedback" tone="success" className="mt-4"><p>Project created.</p><Link href="/app/organisation-A/projects/project-A/overview">Appoint project leadership</Link></FormFeedback>);
    const result=screen.getByRole("status");expect(result.id).toBe("project-feedback");expect(result.className).toContain("min-w-0");expect(result.className).toContain("[overflow-wrap:anywhere]");expect(result.className).toContain("mt-4");expect(result.className).toContain("text-[#24384f]");
    expect(screen.getByRole("link",{name:"Appoint project leadership"}).getAttribute("href")).toBe("/app/organisation-A/projects/project-A/overview");
  });
});
