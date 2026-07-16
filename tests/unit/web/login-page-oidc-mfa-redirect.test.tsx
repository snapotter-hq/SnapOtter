// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

afterEach(() => {
  cleanup();
  useAuth.mockReset();
});

function LocationProbe({ onChange }: { onChange: (search: string) => void }) {
  const location = useLocation();
  onChange(location.search);
  return null;
}

function renderLoginPage(path: string, onLocationChange?: (search: string) => void) {
  useAuth.mockReturnValue({
    oidcEnabled: true,
    oidcProviderName: "Test IdP",
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      {onLocationChange && <LocationProbe onChange={onLocationChange} />}
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

  it("does not show the TOTP prompt for an empty mfaToken param", () => {
    renderLoginPage("/login?mfaToken=");
    expect(screen.queryByPlaceholderText("000000")).not.toBeInTheDocument();
  });

  it("prioritizes an mfaToken over a simultaneous error param", () => {
    renderLoginPage("/login?mfaToken=abc-123&error=oidc_auth_failed");
    expect(screen.getByText(/enter your authentication code/i)).toBeInTheDocument();
    expect(screen.queryByText(/authentication error/i)).not.toBeInTheDocument();
  });

  it("strips mfaToken from the URL after consuming it", async () => {
    let currentSearch = "";
    renderLoginPage("/login?mfaToken=abc-123", (search) => {
      currentSearch = search;
    });
    await waitFor(() => expect(currentSearch).toBe(""));
  });

  it("strips the error param from the URL after consuming it", async () => {
    let currentSearch = "";
    renderLoginPage("/login?error=mfa_enrollment_required", (search) => {
      currentSearch = search;
    });
    await waitFor(() => expect(currentSearch).toBe(""));
  });
});
