// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

afterEach(() => {
  cleanup();
  useAuth.mockReset();
});

function renderLoginPage(path: string) {
  useAuth.mockReturnValue({
    oidcEnabled: true,
    oidcProviderName: "Test IdP",
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("LoginPage OIDC/SAML MFA redirect handling", () => {
  it("shows the TOTP prompt automatically when redirected back with an mfaToken", () => {
    renderLoginPage("/login?mfaToken=abc-123");
    expect(screen.getByText(/enter your authentication code/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("000000")).toBeInTheDocument();
  });

  it("shows the enrollment-required message for the mfa_enrollment_required error code", () => {
    renderLoginPage("/login?error=mfa_enrollment_required");
    expect(screen.getByText(/multi-factor authentication/i)).toBeInTheDocument();
  });
});
