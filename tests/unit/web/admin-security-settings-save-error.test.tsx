// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Settle the settings load on a later macrotask, like a real response, so a
// test that reads the form before it renders fails every run, not just on a
// loaded CI runner (#1785).
const apiGet = vi.hoisted(() =>
  vi
    .fn()
    .mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve({ settings: {} }), 20)),
    ),
);
const apiPut = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPut };
});

import { en } from "@snapotter/shared";
import { AdminSecuritySettings } from "@/components/settings/settings-dialog";
import { ApiError } from "@/lib/api";

afterEach(() => {
  cleanup();
  apiGet.mockClear();
  apiPut.mockReset();
});

describe("AdminSecuritySettings save errors", () => {
  it("names the missing licence when a save is rejected for it (#1445)", async () => {
    apiPut.mockRejectedValue(
      new ApiError("MFA requires an enterprise license", 403, "FEATURE_NOT_LICENSED", {}),
    );

    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    fireEvent.click(await screen.findByRole("button", { name: /save/i }));

    const message = await screen.findByText(en.errors.featureNotLicensed);
    expect(message).toHaveClass("text-destructive");
  });

  it("enforces the API minimum password length of 8", async () => {
    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    // The form renders only after the settings load settles, so wait for it
    // rather than reading it as soon as the request is sent (#1785).
    const input = await screen.findByLabelText("Minimum Password Length");
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
