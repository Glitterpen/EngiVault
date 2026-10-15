import {cleanup,fireEvent,render,screen} from "@testing-library/react";
import {afterEach,describe,expect,it,vi} from "vitest";
import {WorkspacePageHeading} from "./workspace-page-heading";

afterEach(cleanup);

describe("consistent workspace page headings",()=>{
  it("uses one concise h1 with the complete untruncated workspace identity below it",()=>{
    const context=`FEED-001 · ${"Long project name ".repeat(30)}<script>unsafe</script>`;
    const {container}=render(<WorkspacePageHeading title="Project overview" context={context}/>);
    const heading=screen.getByRole("heading",{level:1,name:"Project overview"});
    expect(screen.getAllByRole("heading",{level:1})).toHaveLength(1);
    expect(heading.className).toContain("text-2xl");
    const identity=screen.getByText(context.trim());
    expect(identity.tagName).toBe("P");expect(identity.className).toContain("break-words");
    expect(identity.className).not.toMatch(/truncate|line-clamp/);
    expect(container.querySelector("script")).toBeNull();
  });
  it("keeps optional help adjacent without putting a control inside the page heading",()=>{
    render(<WorkspacePageHeading title="Progress & health" context="PRJ-001 · Terminal" help={<button type="button" aria-label="Progress guidance">?</button>}/>);
    expect(screen.getByRole("heading",{level:1,name:"Progress & health"}).querySelector("button")).toBeNull();
    expect(screen.getByRole("button",{name:"Progress guidance"})).toBeTruthy();
  });
  it("preserves the supplied logo, action name and callback without creating new workflows",()=>{
    const action=vi.fn();
    render(<WorkspacePageHeading title="Projects" context="Example Engineering" logo={<span role="img" aria-label="Organisation logo"/>} actions={<button type="button" onClick={action}>New project</button>}/>);
    expect(screen.getByRole("img",{name:"Organisation logo"})).toBeTruthy();
    fireEvent.click(screen.getByRole("button",{name:"New project"}));expect(action).toHaveBeenCalledTimes(1);
  });
  it("does not fabricate actions or help when none are authorised",()=>{
    render(<WorkspacePageHeading title="My project assignments" context="Example Engineering" actions={false}/>);
    expect(screen.queryByRole("button")).toBeNull();expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByRole("heading",{level:1,name:"My project assignments"})).toBeTruthy();
  });
});
