// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const copyToClipboard = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiPost };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, copyToClipboard };
});

import { en } from "@snapotter/shared";
import { TwoFactorSettings } from "@/components/settings/two-factor-settings";
import { ApiError } from "@/lib/api";

/** A rejected request as api.ts throws it; the message is the server's English. */
const apiError = (status: number, code: string, message: string) =>
  new ApiError(message, status, code, { error: message, code });

const ENROLL_RESPONSE = {
  uri: "otpauth://totp/SnapOtter:admin?secret=JBSWY3DPEHPK3PXP&issuer=SnapOtter",
  recoveryCodes: ["aaaa1111", "bbbb2222"],
};

/**
 * Answer the enroll request on a later macrotask, the way a real network
 * response arrives. With an immediately-resolved mock, a synchronous query
 * placed after `waitFor(() => expect(apiPost).toHaveBeenCalled...)` usually
 * finds the enrolled view anyway and only fails on a loaded CI runner (#1785).
 * Delaying the answer makes that mistake fail on every run.
 */
const respondToEnroll = () =>
  apiPost.mockImplementationOnce(
    () => new Promise((resolve) => setTimeout(() => resolve(ENROLL_RESPONSE), 20)),
  );

/**
 * Click Enable and wait for the enrolled view itself, not just the request:
 * apiPost is called on the click, but the view renders only once its promise
 * settles.
 */
const startEnrollment = async () => {
  fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));
  expect(apiPost).toHaveBeenCalledWith("/auth/mfa/enroll");
  return (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
};

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  apiPost.mockReset();
  copyToClipboard.mockClear();
});

describe("TwoFactorSettings", () => {
  it("shows the enable button when not enrolled", () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    render(<TwoFactorSettings />);
    expect(
      screen.getByRole("button", { name: /enable two-factor authentication/i }),
    ).toBeInTheDocument();
  });

  it("shows the disable button when already enrolled", () => {
    useAuth.mockReturnValue({ totpEnabled: true });
    render(<TwoFactorSettings />);
    expect(
      screen.getByRole("button", { name: /disable two-factor authentication/i }),
    ).toBeInTheDocument();
  });

  it("starts enrollment and shows the QR code, manual secret, and recovery codes", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();

    const { container } = render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));

    expect(apiPost).toHaveBeenCalledWith("/auth/mfa/enroll");
    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByText("aaaa1111")).toBeInTheDocument();
    expect(screen.getByText("bbbb2222")).toBeInTheDocument();
    // qr-code-styling runs for real here (a bare-specifier vi.mock of it never
    // applied from this root-level file) and draws a canvas from an effect
    // that runs just after the render above, so wait for it.
    await waitFor(() => expect(container.querySelector("canvas")).toBeInTheDocument());
  });

  it("ignores a second Enable click while enrollment is still pending", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();

    render(<TwoFactorSettings />);
    const enable = screen.getByRole("button", { name: /enable two-factor authentication/i });
    fireEvent.click(enable);

    expect(enable).toBeDisabled();
    fireEvent.click(enable);
    expect(apiPost).toHaveBeenCalledTimes(1);

    expect(await screen.findByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("names the missing licence when enrollment is rejected (#1445)", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    apiPost.mockRejectedValueOnce(
      apiError(403, "FEATURE_NOT_LICENSED", "MFA requires an enterprise license"),
    );

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));

    expect(await screen.findByText(en.errors.featureNotLicensed)).toBeInTheDocument();
  });

  it("falls back to a generic message when enrollment rejects with a non-Error value", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    apiPost.mockRejectedValueOnce("network exploded");

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));

    // Must render a real message, not "undefined" or the raw non-Error value.
    expect(await screen.findByText(/failed to save/i)).toBeInTheDocument();
    expect(screen.queryByText("network exploded")).not.toBeInTheDocument();
    expect(screen.queryByText(/undefined/i)).not.toBeInTheDocument();
  });

  it("verifies the code and confirms enrollment", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();
    apiPost.mockResolvedValueOnce({ ok: true });

    render(<TwoFactorSettings />);
    const codeInput = await startEnrollment();

    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/auth/mfa/verify", { code: "123456" });
    });
    expect(await screen.findByText(/is now enabled/i)).toBeInTheDocument();
  });

  it("says the code is wrong and stays on the verify step", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();
    apiPost.mockRejectedValueOnce(apiError(400, "INVALID_CODE", "Invalid TOTP or recovery code"));

    render(<TwoFactorSettings />);
    const codeInput = await startEnrollment();

    fireEvent.change(codeInput, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    expect(await screen.findByText(en.auth.mfaInvalidCode)).toBeInTheDocument();
    // Still on the verify step, not bounced back to the idle "Enable" button.
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
  });

  it("doesn't blame the code when verify fails on the server's side", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();
    apiPost.mockRejectedValueOnce(
      apiError(500, "DECRYPTION_FAILED", "Failed to decrypt TOTP secret"),
    );

    render(<TwoFactorSettings />);
    const codeInput = await startEnrollment();

    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    // Must not be mislabeled as a wrong code -- a decryption/config failure
    // needs its own diagnosable message, not a generic "invalid code" that
    // sends the user into an unwinnable retry loop.
    expect(await screen.findByText(en.settings.security.twoFactorUnreadable)).toBeInTheDocument();
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
  });

  it("cancels enrollment and returns to the idle view without verifying", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();

    render(<TwoFactorSettings />);
    await startEnrollment();

    fireEvent.click(screen.getByRole("button", { name: /^cancel$/i }));

    expect(
      screen.getByRole("button", { name: /enable two-factor authentication/i }),
    ).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledTimes(1);
  });

  it("disables two-factor auth with a valid code", async () => {
    useAuth.mockReturnValue({ totpEnabled: true });
    apiPost.mockResolvedValueOnce({ ok: true });

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /disable two-factor authentication/i }));

    // Confirm the disable form actually rendered before reusing the same
    // accessible name for the submit button below -- otherwise a broken
    // idle-to-disabling transition could resolve the second query to the
    // wrong element instead of failing clearly.
    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /disable two-factor authentication/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/auth/mfa/disable", { code: "654321" });
    });
    expect(await screen.findByText(/has been disabled/i)).toBeInTheDocument();
  });

  it("doesn't blame the code when disable fails on the server's side", async () => {
    useAuth.mockReturnValue({ totpEnabled: true });
    apiPost.mockRejectedValueOnce(
      apiError(500, "DECRYPTION_FAILED", "Failed to decrypt TOTP secret"),
    );

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /disable two-factor authentication/i }));

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /disable two-factor authentication/i }));

    expect(await screen.findByText(en.settings.security.twoFactorUnreadable)).toBeInTheDocument();
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
  });

  it("copies recovery codes to the clipboard", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();

    render(<TwoFactorSettings />);
    await startEnrollment();

    fireEvent.click(screen.getByRole("button", { name: /copy codes/i }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith("aaaa1111\nbbbb2222");
    });
    expect(await screen.findByRole("button", { name: /^copied$/i })).toBeInTheDocument();
  });

  it("shows an error instead of silently doing nothing when the clipboard write fails", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();
    copyToClipboard.mockResolvedValueOnce(false);

    render(<TwoFactorSettings />);
    await startEnrollment();

    fireEvent.click(screen.getByRole("button", { name: /copy codes/i }));

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalled());
    expect(await screen.findByText(/couldn't copy automatically/i)).toBeInTheDocument();
    // Button must not claim success it didn't achieve.
    expect(screen.queryByRole("button", { name: /^copied$/i })).not.toBeInTheDocument();
  });

  it("strips non-digit characters from the verify code as the user types", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();

    render(<TwoFactorSettings />);
    const codeInput = await startEnrollment();
    fireEvent.change(codeInput, { target: { value: "12ab34" } });

    expect(codeInput.value).toBe("1234");
  });

  it("keeps the confirm button disabled until the code reaches 6 digits", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    respondToEnroll();

    render(<TwoFactorSettings />);
    const codeInput = await startEnrollment();
    const confirmButton = screen.getByRole("button", { name: /confirm and enable/i });

    fireEvent.change(codeInput, { target: { value: "12345" } });
    expect(confirmButton).toBeDisabled();

    fireEvent.change(codeInput, { target: { value: "123456" } });
    expect(confirmButton).not.toBeDisabled();
  });

  it("keeps the disable button disabled until the code reaches 6 digits", async () => {
    useAuth.mockReturnValue({ totpEnabled: true });

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /disable two-factor authentication/i }));

    const codeInput = await screen.findByPlaceholderText("000000");
    const submitButtons = screen.getAllByRole("button", {
      name: /disable two-factor authentication/i,
    });
    const submitButton = submitButtons[submitButtons.length - 1];

    fireEvent.change(codeInput, { target: { value: "9999" } });
    expect(submitButton).toBeDisabled();

    fireEvent.change(codeInput, { target: { value: "999999" } });
    expect(submitButton).not.toBeDisabled();
  });
});
