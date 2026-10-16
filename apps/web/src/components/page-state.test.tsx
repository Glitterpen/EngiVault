import {afterEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import {PageState} from "./page-state";
import {ReadUnavailable} from "./read-unavailable";
import WorkspaceLoading from "@/app/app/loading";

afterEach(cleanup);

it("shows loading as loading, without invented counts, progress or retry actions",()=>{
  render(<WorkspaceLoading/>);
  const state=screen.getByRole("status");
  expect(within(state).getByRole("heading",{name:"Loading workspace…"})).toBeTruthy();
  expect(state.textContent).not.toMatch(/0%|100%|no documents|no results|failed/i);
  expect(screen.queryByRole("progressbar")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(screen.queryByRole("button")).toBeNull();
});

it("keeps read failures alerting and preserves the exact preview-safe GET retry",()=>{
  render(<ReadUnavailable title="Documents could not be loaded" href="/app/documents?q=pipe">Your documents remain unchanged.</ReadUnavailable>);
  const state=screen.getByRole("alert");
  expect(within(state).getByRole("heading",{level:1,name:"Documents could not be loaded"})).toBeTruthy();
  expect(state.textContent).toContain("Your documents remain unchanged.");
  const retry=within(state).getByRole("link",{name:"Retry loading"});
  expect(retry.getAttribute("href")).toBe("/app/documents?q=pipe");
  expect(retry.hasAttribute("data-preview-safe")).toBe(true);
  expect(screen.queryByRole("button")).toBeNull();
});

it("does not mark a whole failed-state subtree preview-safe",()=>{
  render(<ReadUnavailable title="Unavailable" href="/app"/>);
  expect(screen.getByRole("alert").hasAttribute("data-preview-safe")).toBe(false);
});

it("keeps genuine empty results non-live and allows only caller-owned actions",()=>{
  const clear=vi.fn();
  render(<PageState kind="empty" title="No matches" headingLevel={3} actions={<button type="button" onClick={clear}>Clear search</button>}>Try a different document number.</PageState>);
  expect(screen.getByRole("heading",{level:3,name:"No matches"})).toBeTruthy();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Clear search"}));
  expect(clear).toHaveBeenCalledTimes(1);
});

it("has decorative icons only and keeps error descriptions and actions readable",()=>{
  render(<PageState kind="error" title="The list is unavailable" actions={<a href="https://example.com/help">Help</a>}>Please retry shortly.</PageState>);
  const state=screen.getByRole("alert");
  expect(state.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  expect(state.getAttribute("aria-atomic")).toBe("true");
  expect(state.textContent).toContain("Please retry shortly.");
  expect(within(state).getByRole("link",{name:"Help"}).getAttribute("href")).toBe("https://example.com/help");
});
