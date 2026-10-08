// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  vi.unstubAllGlobals();
});

const ENROLLMENT_URI = "otpauth://totp/SnapOtter:admin?secret=JBSWY3DPEHPK3PXP&issuer=SnapOtter";

const EXPIRED_MESSAGE = "Your verification session expired. Please log in again.";

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

function failedResponse(status: number, body: unknown) {
  return {
    ok: false,
    status,
    headers: new Headers(),
    json: async () => body,
  };
}

function stubTotpFlow(second: ReturnType<typeof failedResponse>) {
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
    })
    .mockResolvedValueOnce(second);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubEnrollFlow(second: ReturnType<typeof failedResponse>) {
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
    .mockResolvedValueOnce(second);
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("LoginPage MFA challenge expiry (#1234)", () => {
  it("says the session expired and returns to the password form on MFA_EXPIRED", async () => {
    stubTotpFlow(failedResponse(401, { error: "MFA session expired", code: "MFA_EXPIRED" }));

    renderLoginPage();
    await submitLogin();

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(screen.getByText(EXPIRED_MESSAGE)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("000000")).not.toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });

  it("still reports a genuinely wrong code as invalid and keeps the prompt", async () => {
    stubTotpFlow(failedResponse(401, { error: "Invalid code", code: "INVALID_CODE" }));

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid code/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(EXPIRED_MESSAGE)).not.toBeInTheDocument();
    expect(codeInput.value).toBe("");
  });

  it("says the session expired and returns to the password form on enroll-complete MFA_EXPIRED", async () => {
    stubEnrollFlow(failedResponse(401, { error: "MFA session expired", code: "MFA_EXPIRED" }));

    renderLoginPage();
    await submitLogin();

    const codeInput = await screen.findByLabelText(/6-digit code/i);
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(screen.getByText(EXPIRED_MESSAGE)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/6-digit code/i)).not.toBeInTheDocument();
    expect(screen.getByLabelText(/username/i)).toBeInTheDocument();
  });
});
