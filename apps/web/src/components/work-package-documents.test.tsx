import {afterEach, expect, it, vi} from "vitest";
import {cleanup, fireEvent, render, screen, within} from "@testing-library/react";
import {WorkPackageDocuments, type WorkPackageDocument} from "./work-package-documents";
import {AdminPreviewBoundary} from "./admin-preview-boundary";

vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
afterEach(cleanup);

const document = (id: string, discipline = "Process", inclusion_state = "included"): WorkPackageDocument => ({
  id, document_number: `ENG-${id}`, discipline, document_type: "Drawing", revision_code: "D01",
  issue_status: "Issued for Design (IFD)", inclusion_state,
});
const items = [document("latest"), document("electrical", "Electrical", "missing_revision"), document("earlier"), document("mismatch", "Electrical", "status_mismatch")];

it("starts with compact, collapsed discipline folders and preserves the supplied item order", () => {
  const {container} = render(<WorkPackageDocuments items={items} />);
  const folders = Array.from(container.querySelectorAll("details"));
  expect(folders).toHaveLength(2);
  expect(folders.every(folder => !folder.open)).toBe(true);
  expect(folders[0].querySelector("summary")?.textContent).toContain("Process");
  fireEvent.click(screen.getByText("Process").closest("summary")!);
  expect(within(screen.getByRole("list", {name: "Process package documents"})).getAllByRole("heading").map(heading => heading.textContent)).toEqual(["ENG-latest", "ENG-earlier"]);
  expect(screen.getByText("2 exceptions")).toBeTruthy();
  expect(items.map(item => item.id)).toEqual(["latest", "electrical", "earlier", "mismatch"]);
});

it.each(["ENG-latest", " process ", "D01", "Drawing", "ifd", "included in package"])("searches existing metadata locally and opens matching groups: %s", search => {
  render(<WorkPackageDocuments items={items} />);
  fireEvent.change(screen.getByRole("searchbox", {name: "Find a package document"}), {target: {value: search}});
  expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  expect(screen.getByRole("heading", {name: "ENG-latest"})).toBeTruthy();
  expect(screen.queryByRole("button", {name: /Generate|Download|Approve|Retry/})).toBeNull();
});

it("uses human-facing inclusion and exception labels without hiding exceptions", () => {
  render(<WorkPackageDocuments items={items} />);
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "Electrical"}});
  expect(screen.getByText("Revision unavailable")).toBeTruthy();
  expect(screen.getByText("Issue purpose does not match")).toBeTruthy();
  expect(screen.queryByText("missing_revision")).toBeNull();
  expect(screen.queryByText("status_mismatch")).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("2 of 4 documents · 1 discipline");
});

it("offers a recoverable empty search and restores collapsed folders when cleared", () => {
  const {container} = render(<WorkPackageDocuments items={items} />);
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "does not exist"}});
  expect(screen.getByText("No package documents match your search.")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toBe("0 of 4 documents · 0 disciplines");
  fireEvent.click(screen.getByRole("button", {name: "Clear search"}));
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("");
  expect(container.querySelectorAll("details")).toHaveLength(2);
  expect(Array.from(container.querySelectorAll("details")).every(folder => !folder.open)).toBe(true);
});

it("keeps empty packages distinct from an empty search", () => {
  render(<WorkPackageDocuments items={[]} />);
  expect(screen.getByText("0 documents")).toBeTruthy();
  expect(screen.getByText("No documents are recorded in this package.")).toBeTruthy();
  expect(screen.queryByRole("searchbox")).toBeNull();
});

it("keeps read-only navigation usable in an audited preview without adding write controls", () => {
  render(<AdminPreviewBoundary preview={{organisationId: "org", projectId: "project", role: "document_controller", displayName: "DCC", disciplines: [], expiresAt: "2099-01-01"}}>
    <WorkPackageDocuments items={items} />
  </AdminPreviewBoundary>);
  const search = screen.getByRole("searchbox") as HTMLInputElement;
  expect(search.disabled).toBe(false);
  fireEvent.change(search, {target: {value: "nothing"}});
  const clear = screen.getByRole("button", {name: "Clear search"}) as HTMLButtonElement;
  expect(clear.disabled).toBe(false);
  fireEvent.click(clear);
  fireEvent.click(screen.getByText("Process").closest("summary")!);
  expect(screen.getByRole("heading", {name: "ENG-latest"})).toBeTruthy();
});

it("keeps long document and discipline names readable and exposes a labelled section", () => {
  const long = document("X".repeat(160), "Long discipline ".repeat(12).trim());
  render(<WorkPackageDocuments items={[long]} />);
  expect(screen.getByRole("region", {name: "Package documents"})).toBeTruthy();
  fireEvent.change(screen.getByRole("searchbox"), {target: {value: "ENG-"}});
  expect(screen.getByRole("heading", {name: long.document_number}).className).toContain("min-w-0");
  expect(screen.getByText(long.discipline).className).toContain("break-words");
});
