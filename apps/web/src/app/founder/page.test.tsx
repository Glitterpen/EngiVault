import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { getFounderPortfolio } from "@/lib/founder";
import FounderPage from "./page";

vi.mock("@/lib/founder", () => ({ getFounderPortfolio: vi.fn() }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

it("keeps the founder summary and read-only destinations visible without changing the portfolio query", async () => {
  vi.mocked(getFounderPortfolio).mockResolvedValue({
    authorised: true,
    generated_at: "2026-11-15T12:00:00Z",
    summary: { organisations: 3, active_licences: 2, users: 8, needs_attention: 1, orphaned_users: 0, new_organisations: 1, deleted_organisations: 2 },
    organisations: [],
    filters: { search: "Engineering", health: "attention", status: "current", limit: 20, offset: 0 },
  });
  render(await FounderPage({ searchParams: Promise.resolve({ q: "Engineering", health: "attention" }) }));

  expect(getFounderPortfolio).toHaveBeenCalledExactlyOnceWith({ search: "Engineering", health: "attention", status: "current" });
  expect(screen.getByRole("heading", { name: "Organisation and licence health", level: 1 })).toBeVisible();
  const summary = within(screen.getByRole("region", { name: "Platform summary" }));
  expect(summary.getByText("Healthy tenants").nextElementSibling).toHaveTextContent("2");
  const shortcuts = within(screen.getByRole("region", { name: "Oversight shortcuts" }));
  expect(shortcuts.getByRole("link", { name: "Deleted accounts 2 deleted" })).toHaveAttribute("href", "/founder/deleted");
  expect(shortcuts.getByRole("link", { name: "Browse organisations" })).toHaveAttribute("href", "#organisation-filters");
  const filters = screen.getByRole("form", { name: "Filter current organisations" });
  expect(within(filters).getByRole("textbox", { name: "Search organisations" })).toHaveValue("Engineering");
  expect(within(filters).getByRole("combobox", { name: "Account health" })).toHaveValue("attention");
  expect(screen.queryByRole("button", { name: /edit|delete|invite/i })).toBeNull();
});
