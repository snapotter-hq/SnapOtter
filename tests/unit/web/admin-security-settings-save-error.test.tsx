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

  it("matches the API minimum password length of 1 (#1028)", async () => {
    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    // The form renders only after the settings load settles, so wait for it
    // rather than reading it as soon as the request is sent (#1785).
    const input = await screen.findByLabelText("Minimum Password Length");
    expect(input).toHaveAttribute("min", "1");
  });

  it("lets an admin switch the lowercase rule off and saves it (#1028)", async () => {
    apiPut.mockResolvedValue({});

    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const toggle = await screen.findByRole("switch", {
      name: en.settings.security.passwordRequireLowercase,
    });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "false");

    fireEvent.click(await screen.findByRole("button", { name: /save/i }));
    await waitFor(() =>
      expect(apiPut).toHaveBeenCalledWith(
        "/v1/settings",
        expect.objectContaining({ passwordRequireLowercase: "false" }),
      ),
    );
  });

  it("puts a refused setting back where it was, so the tab stops showing a value the server never took (#2339)", async () => {
    apiPut.mockRejectedValue(
      new ApiError("SSO enforcement requires an enterprise license", 403, "FEATURE_NOT_LICENSED", {
        setting: "ssoEnforcement",
      }),
    );

    render(<AdminSecuritySettings />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());

    const toggle = await screen.findByRole("switch", {
      name: en.settings.security.ssoEnforcement,
    });
    expect(toggle).toHaveAttribute("aria-checked", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");

    fireEvent.click(await screen.findByRole("button", { name: /save/i }));

    await waitFor(() => expect(toggle).toHaveAttribute("aria-checked", "false"));
    expect(await screen.findByText(en.errors.featureNotLicensed)).toHaveClass("text-destructive");
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
