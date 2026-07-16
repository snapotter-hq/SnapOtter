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

vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
    update() {}
  },
}));

import { TwoFactorSettings } from "@/components/settings/two-factor-settings";

const ENROLL_RESPONSE = {
  uri: "otpauth://totp/SnapOtter:admin?secret=JBSWY3DPEHPK3PXP&issuer=SnapOtter",
  recoveryCodes: ["aaaa1111", "bbbb2222"],
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
    apiPost.mockResolvedValueOnce(ENROLL_RESPONSE);

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/auth/mfa/enroll");
    });
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    expect(screen.getByText("aaaa1111")).toBeInTheDocument();
    expect(screen.getByText("bbbb2222")).toBeInTheDocument();
  });

  it("surfaces the server's error when enrollment is rejected (e.g. unlicensed)", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    apiPost.mockRejectedValueOnce(new Error("MFA requires an enterprise license"));

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));

    expect(await screen.findByText("MFA requires an enterprise license")).toBeInTheDocument();
  });

  it("verifies the code and confirms enrollment", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    apiPost.mockResolvedValueOnce(ENROLL_RESPONSE);
    apiPost.mockResolvedValueOnce({ ok: true });

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/auth/mfa/enroll"));

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/auth/mfa/verify", { code: "123456" });
    });
    expect(await screen.findByText(/is now enabled/i)).toBeInTheDocument();
  });

  it("shows an invalid-code error and stays on the verify step when the code is wrong", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    apiPost.mockResolvedValueOnce(ENROLL_RESPONSE);
    apiPost.mockRejectedValueOnce(new Error("Invalid TOTP or recovery code"));

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/auth/mfa/enroll"));

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    expect(await screen.findByText(/invalid code/i)).toBeInTheDocument();
    // Still on the verify step, not bounced back to the idle "Enable" button.
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
  });

  it("cancels enrollment and returns to the idle view without verifying", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    apiPost.mockResolvedValueOnce(ENROLL_RESPONSE);

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/auth/mfa/enroll"));

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

    fireEvent.change(screen.getByPlaceholderText("000000"), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: /disable two-factor authentication/i }));

    await waitFor(() => {
      expect(apiPost).toHaveBeenCalledWith("/auth/mfa/disable", { code: "654321" });
    });
    expect(await screen.findByText(/has been disabled/i)).toBeInTheDocument();
  });

  it("copies recovery codes to the clipboard", async () => {
    useAuth.mockReturnValue({ totpEnabled: false });
    apiPost.mockResolvedValueOnce(ENROLL_RESPONSE);

    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: /enable two-factor authentication/i }));
    await waitFor(() => expect(apiPost).toHaveBeenCalledWith("/auth/mfa/enroll"));

    fireEvent.click(screen.getByRole("button", { name: /copy codes/i }));

    await waitFor(() => {
      expect(copyToClipboard).toHaveBeenCalledWith("aaaa1111\nbbbb2222");
    });
    expect(await screen.findByRole("button", { name: /^copied$/i })).toBeInTheDocument();
  });
});
