import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { ServiceError } from "./service-error";

afterEach(cleanup);
it("renders a branded retry screen without provider messages, stacks or raw digests", () => {
  const retry = vi.fn();
  const error = Object.assign(new Error("Supabase on Railway failed"), { digest: "vercel-debug-id" });
  render(<ServiceError error={error} retry={retry} />);
  expect(screen.getByRole("alert").textContent).toContain("EngiCite");
  expect(screen.getByRole("alert").textContent).not.toMatch(/supabase|railway|vercel/i);
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  expect(retry).toHaveBeenCalledOnce();
});
