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

function stubTotpFlow(secondResponse: {
  status: number;
  headers?: Record<string, string>;
  json: () => Promise<unknown>;
}) {
  const fetchMock = vi
    .fn()
    // login -> requires an already-enrolled TOTP challenge
    .mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ requiresMfa: true, mfaToken: "mfa-token-1" }),
    })
    .mockResolvedValueOnce({
      ok: false,
      status: secondResponse.status,
      headers: new Headers(secondResponse.headers ?? {}),
      json: secondResponse.json,
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function stubEnrollFlow(secondResponse: {
  status: number;
  headers?: Record<string, string>;
  json: () => Promise<unknown>;
}) {
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
      status: secondResponse.status,
      headers: new Headers(secondResponse.headers ?? {}),
      json: secondResponse.json,
    });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("LoginPage MFA-complete throttling (#1148)", () => {
  it("reports the wait, not an invalid code, when the per-IP throttle fires", async () => {
    stubTotpFlow({
      status: 429,
      headers: { "Retry-After": "120" },
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(screen.getByText("Too many attempts. Try again in 2 minutes.")).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
    // The code the user typed was probably fine; don't punish a retype.
    expect(codeInput.value).toBe("123456");
  });

  it("rounds a part-minute wait up to the singular form", async () => {
    stubTotpFlow({
      status: 429,
      headers: { "Retry-After": "45" },
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(screen.getByText("Too many attempts. Try again in 1 minute.")).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("123456");
  });

  it("still says wait when the 429 carries no retry hint at all", async () => {
    stubTotpFlow({
      status: 429,
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Too many attempts. Please wait before trying again."),
      ).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("123456");
  });

  it("reports a connection error, not an invalid code, on a 5xx", async () => {
    stubTotpFlow({
      status: 502,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(screen.getByText(/connection error/i)).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("123456");
  });

  it("still shows the invalid-code message and clears the field on a genuinely rejected code", async () => {
    stubTotpFlow({
      status: 401,
      json: async () => ({ error: "Invalid TOTP or recovery code", code: "INVALID_CODE" }),
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByPlaceholderText("000000")) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid code/i)).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("");
  });
});

describe("LoginPage MFA-enrollment throttling (#1148)", () => {
  it("reports the wait, not an invalid code, when the per-IP throttle fires", async () => {
    stubEnrollFlow({
      status: 429,
      headers: { "Retry-After": "90" },
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByLabelText(/6-digit code/i)) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(screen.getByText("Too many attempts. Try again in 2 minutes.")).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid code/i)).not.toBeInTheDocument();
    expect(codeInput.value).toBe("123456");
  });

  it("still says wait when the 429 carries no retry hint at all", async () => {
    stubEnrollFlow({
      status: 429,
      json: async () => ({ error: "Rate limit exceeded" }),
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByLabelText(/6-digit code/i)) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Too many attempts. Please wait before trying again."),
      ).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("123456");
  });

  it("reports a connection error, not an invalid code, on a 5xx", async () => {
    stubEnrollFlow({
      status: 503,
      json: async () => {
        throw new Error("Unexpected token < in JSON");
      },
    });

    renderLoginPage();
    await submitLogin();

    const codeInput = (await screen.findByLabelText(/6-digit code/i)) as HTMLInputElement;
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm and enable/i }));

    await waitFor(() => {
      expect(screen.getByText(/connection error/i)).toBeInTheDocument();
    });
    expect(codeInput.value).toBe("123456");
  });
});
