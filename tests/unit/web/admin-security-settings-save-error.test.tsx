// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiGet = vi.hoisted(() => vi.fn().mockResolvedValue({ settings: {} }));
const apiPut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPut };
});

import { AdminSecuritySettings } from "@/components/settings/settings-dialog";

afterEach(() => {
  cleanup();
  apiGet.mockClear();
  apiPut.mockReset();
});

describe("AdminSecuritySettings save errors", () => {
  it("shows the server's specific error message when a save is rejected", async () => {
    apiPut.mockRejectedValue(new Error("MFA requires an enterprise license"));

    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: /save/i }));

    const message = await screen.findByText("MFA requires an enterprise license");
    expect(message).toHaveClass("text-destructive");
  });

  it("enforces the API minimum password length of 8", async () => {
    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const input = screen.getByLabelText("Minimum Password Length");
    expect(input).toHaveAttribute("min", "8");
  });

  it("falls back to a generic message when the save rejects with a non-Error value", async () => {
    apiPut.mockRejectedValue("network exploded");

    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: /save/i }));

    const message = await screen.findByText("Failed to save security settings");
    expect(message).toHaveClass("text-destructive");
  });
});
