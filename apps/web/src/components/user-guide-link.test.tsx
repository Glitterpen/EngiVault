import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { UserGuideLink } from "./user-guide-link";

afterEach(cleanup);

describe("dashboard user guide link", () => {
  it("shows one button-styled link that opens the organisation PDF in a new tab", () => {
    render(<UserGuideLink organisationId="org" />);

    const guide = screen.getByRole("link", { name: "User guide (PDF, opens in a new tab)" });
    expect(screen.getAllByRole("link")).toEqual([guide]);
    expect(guide).toHaveTextContent("User guide");
    expect(guide).toHaveAttribute("href", "/api/v1/organisations/org/user-guide");
    expect(guide).toHaveAttribute("target", "_blank");
    expect(guide).toHaveAttribute("rel", "noopener noreferrer");
    expect(guide).not.toHaveAttribute("download");
  });

  it("scopes the project PDF without sending a role from the browser", () => {
    render(<UserGuideLink organisationId="org" projectId="project" />);

    expect(screen.getByRole("link", { name: /^user guide/i })).toHaveAttribute("href", "/api/v1/organisations/org/user-guide?project=project");
  });
});
