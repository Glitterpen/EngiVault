import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DashboardDates, DashboardLead, DashboardPanel, DashboardSummary, DashboardWorkQueue, RoleDashboard } from "./role-dashboard";

afterEach(cleanup);

describe("shared role dashboard", () => {
  it("keeps project context and a labelled queue visible without an expandable panel", () => {
    render(<RoleDashboard>
      <DashboardLead>
        <DashboardPanel id="project-brief" title="Project brief and dates"><DashboardDates start="2026-09-07" end="2026-10-09" /></DashboardPanel>
        <DashboardWorkQueue id="work-queue" title="Work queue" items={[
          { href: "#project-brief", title: "Project brief", description: "Review agreed dates." },
          { href: "/reviews", title: "Review submissions", description: "Check conformance.", badge: { text: "Count unavailable" } },
        ]} />
      </DashboardLead>
    </RoleDashboard>);

    const brief = screen.getByRole("region", { name: "Project brief and dates" });
    const queue = screen.getByRole("region", { name: "Work queue" });
    expect(brief.closest("details")).toBeNull();
    expect(queue.closest("details")).toBeNull();
    expect(brief).toHaveAttribute("tabindex", "-1");
    expect(within(queue).getByRole("link", { name: "Project brief", description: "Review agreed dates." })).toHaveAttribute("href", "#project-brief");
    expect(within(queue).getByRole("link", { name: "Review submissions Count unavailable", description: "Check conformance." })).toHaveAttribute("href", "/reviews");
    expect(Array.from(brief.querySelectorAll("time"), date => date.dateTime)).toEqual(["2026-09-07", "2026-10-09"]);
  });

  it("does not roll invalid planning dates into a different date", () => {
    const { container } = render(<DashboardDates start="2026-02-30" end={null} />);
    expect(container.querySelector("time")).toBeNull();
    expect(screen.getAllByText("Not planned")).toHaveLength(2);
  });

  it("preserves distinction between zero, unavailable and an attention count", () => {
    render(<DashboardSummary title="Register summary" items={[
      { label: "Accepted", value: 0 },
      { label: "Awaiting review", value: "Unavailable" },
      { label: "Overdue", value: 3, attention: true, note: "Based on the submission schedule." },
    ]} />);

    const summary = within(screen.getByRole("region", { name: "Register summary" }));
    expect(summary.getByText("Accepted").nextElementSibling).toHaveTextContent("0");
    expect(summary.getByText("Awaiting review").nextElementSibling).toHaveTextContent("Unavailable");
    expect(summary.getByText("Overdue").nextElementSibling).toHaveTextContent("3");
    expect(summary.getByText("Based on the submission schedule.")).toBeVisible();
  });
});
