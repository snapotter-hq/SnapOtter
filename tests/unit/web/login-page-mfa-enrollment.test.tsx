// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

// qr-code-styling reaches for canvas/DOM APIs jsdom doesn't implement, and the
// QR image itself isn't what we're asserting on. Stub it so the enrollment
// panel renders and we can check the recovery codes, manual secret, and code
// input instead.
vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
  },
}));

import { LoginPage } from "@/pages/login-page";

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  vi.unstubAllGlobals();
});

const ENROLLMENT_URI = "otpauth://totp/SnapOtter:admin?secret=JBSWY3DPEHPK3PXP&issuer=SnapOtter";

function renderLoginPage() {
  useAuth.mockReturnValue({
    oidcEnabled: false,
    oidcProviderName: null,
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
  });
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

async function submitLogin() {
  fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
  fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
  fireEvent.click(screen.getByRole("button", { name: /^login$/i }));
}

describe("LoginPage forced MFA enrollment", () => {
  it("shows the enrollment panel when login returns requiresMfaEnrollment", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          requiresMfaEnrollment: true,
          enrollmentToken: "enroll-token-1",
          uri: ENROLLMENT_URI,
          recoveryCodes: ["AAAA-1111", "BBBB-2222"],
        }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    // Recovery codes and the manual secret from the URI are rendered.
    await waitFor(() => {
      expect(screen.getByText("AAAA-1111")).toBeInTheDocument();
    });
    expect(screen.getByText("BBBB-2222")).toBeInTheDocument();
    expect(screen.getByText("JBSWY3DPEHPK3PXP")).toBeInTheDocument();
    // The 6-digit confirmation input is present, the password form is gone.
    expect(screen.getByLabelText(/6-digit code/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^password$/i)).not.toBeInTheDocument();
  });

  it("POSTs to /api/auth/mfa/enroll-complete when the code is confirmed", async () => {
    const fetchMock = vi
      .fn()
      // login -> forced enrollment
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          requiresMfaEnrollment: true,
          enrollmentToken: "enroll-token-1",
          uri: ENROLLMENT_URI,
          recoveryCodes: ["AAAA-1111", "BBBB-2222"],
        }),
      })
      // enroll-complete -> session issued
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          token: "session-token",
          user: { username: "admin", mustChangePassword: false },
          expiresAt: new Date().toISOString(),
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    renderLoginPage();
    await submitLogin();

    const codeInput = await screen.findByLabelText(/6-digit code/i);
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/mfa/enroll-complete",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ enrollmentToken: "enroll-token-1", code: "123456" }),
        }),
      );
    });
  });

  it("shows the invalid-code message and clears the field on a rejected code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          requiresMfaEnrollment: true,
          enrollmentToken: "enroll-token-1",
          uri: ENROLLMENT_URI,
          recoveryCodes: ["AAAA-1111"],
        }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ code: "INVALID_CODE" }),
      });
    vi.stubGlobal("fetch", fetchMock);

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByLabelText(/6-digit code/i)) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid code/i)).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("");
  });
});
