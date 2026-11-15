import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserGuideLinks } from "./user-guide-links";

afterEach(cleanup);

describe("dashboard user guide links", () => {
  it("opens the organisation PDF separately and downloads the Word guide", () => {
    render(<UserGuideLinks organisationId="org" />);

    const guide = within(screen.getByRole("group", { name: "User guide" }));
    const open = guide.getByRole("link", { name: /open pdf user guide.*new tab/i });
    const download = guide.getByRole("link", { name: "Download Word user guide" });
    expect(open).toHaveAttribute("href", "/api/v1/organisations/org/user-guide");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
    expect(download).toHaveAttribute("href", "/api/v1/organisations/org/user-guide?format=docx");
    expect(download).toHaveAttribute("download");
  });

  it("keeps both project links scoped without sending a role from the browser", () => {
    render(<UserGuideLinks organisationId="org" projectId="project" />);

    const open = screen.getByRole("link", { name: /^open pdf/i });
    const download = screen.getByRole("link", { name: /^download word/i });
    expect(open).toHaveAttribute("href", "/api/v1/organisations/org/user-guide?project=project");
    expect(download).toHaveAttribute("href", "/api/v1/organisations/org/user-guide?project=project&format=docx");
  });
});
