// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  vi.unstubAllGlobals();
});

function LocationProbe({ onChange }: { onChange: (search: string) => void }) {
  const location = useLocation();
  onChange(location.search);
  return null;
}

function renderLoginPage(
  path: string,
  onLocationChange?: (search: string) => void,
  authOverrides: Partial<{
    oidcEnabled: boolean;
    oidcProviderName: string | null;
    samlEnabled: boolean;
    samlProviderName: string | null;
    ssoEnforced: boolean;
  }> = {},
) {
  useAuth.mockReturnValue({
    oidcEnabled: true,
    oidcProviderName: "Test IdP",
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
    ...authOverrides,
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

  it("shows the retryable policy message for the mfa_policy_unavailable error code", () => {
    renderLoginPage("/login?error=mfa_policy_unavailable");
    expect(screen.getByText(/mfa policy could not be checked/i)).toBeInTheDocument();
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

  it("tells the user the SSO provider session may still be open on ?notice=idp_logout_failed and strips the param (#1800)", async () => {
    let currentSearch = "";
    renderLoginPage("/login?notice=idp_logout_failed", (search) => {
      currentSearch = search;
    });

    expect(screen.getByRole("status")).toHaveTextContent(
      "You're signed out of SnapOtter, but your SSO provider session may still be open. Sign out there too.",
    );
    await waitFor(() => expect(currentSearch).toBe(""));
  });

  it("clears the idp_logout_failed notice when the login form is submitted (#1800)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: "Invalid credentials" }),
      }),
    );
    renderLoginPage("/login?notice=idp_logout_failed");
    expect(screen.getByRole("status")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }));

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    });
  });

  it("ignores an unknown notice value and still strips the param (#1800)", async () => {
    let currentSearch = "";
    renderLoginPage("/login?notice=something_else", (search) => {
      currentSearch = search;
    });

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByText(/authentication error/i)).not.toBeInTheDocument();
    await waitFor(() => expect(currentSearch).toBe(""));
  });

  it("renders the expiry message outside the dimmed local form and focuses the SSO button when an SSO-started MFA challenge restarts under ssoEnforced (#2022)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: "MFA session expired", code: "MFA_EXPIRED" }),
      }),
    );

    renderLoginPage("/login?mfaToken=abc-123", undefined, { ssoEnforced: true });

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    const errorEl = await screen.findByText(
      "Your verification session expired. Please log in again.",
    );
    const form = screen.getByLabelText(/username/i).closest("form");
    expect(form).not.toBeNull();
    expect(form).toHaveClass("opacity-60");
    expect(errorEl.closest("form")).toBeNull();
    expect(errorEl.closest(".opacity-60")).toBeNull();
    expect(
      errorEl.compareDocumentPosition(form as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    const ssoLink = screen.getByRole("link", { name: /sign in with test idp/i });
    await waitFor(() => expect(ssoLink).toHaveFocus());
  });

  it("focuses the SAML button when an SSO-started MFA challenge restarts under SAML-only ssoEnforced (#2022)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({
          error: "Too many invalid codes; MFA challenge expired",
          code: "MFA_ATTEMPTS_EXHAUSTED",
        }),
      }),
    );

    renderLoginPage("/login?mfaToken=abc-123", undefined, {
      oidcEnabled: false,
      oidcProviderName: null,
      samlEnabled: true,
      samlProviderName: "Okta SAML",
      ssoEnforced: true,
    });

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    const errorEl = await screen.findByText("Too many invalid codes. Please log in again.");
    expect(errorEl.closest("form")).toBeNull();
    expect(errorEl.closest(".opacity-60")).toBeNull();

    const samlLink = screen.getByRole("link", { name: /sign in with okta saml/i });
    await waitFor(() => expect(samlLink).toHaveFocus());
  });

  it("falls back to focusing the username field when a redirected mfaToken restarts with no SSO buttons rendered (#2022)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: "MFA session expired", code: "MFA_EXPIRED" }),
      }),
    );

    renderLoginPage("/login?mfaToken=abc-123", undefined, {
      oidcEnabled: false,
      oidcProviderName: null,
      samlEnabled: false,
      samlProviderName: null,
      ssoEnforced: false,
    });

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    const errorEl = await screen.findByText(
      "Your verification session expired. Please log in again.",
    );
    expect(errorEl.closest("form")).toBeNull();
    await waitFor(() => expect(screen.getByLabelText(/username/i)).toHaveFocus());
  });

  it("moves the error back inside the local form when a local login is submitted after an SSO MFA restart (#2022)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ error: "MFA session expired", code: "MFA_EXPIRED" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ error: "Invalid credentials" }),
        }),
    );

    renderLoginPage("/login?mfaToken=abc-123", undefined, { ssoEnforced: true });

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    const expiredEl = await screen.findByText(
      "Your verification session expired. Please log in again.",
    );
    expect(expiredEl.closest("form")).toBeNull();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }));

    const invalidEl = await screen.findByText(/invalid username or password/i);
    const form = screen.getByLabelText(/username/i).closest("form");
    expect(invalidEl.closest("form")).toBe(form);
    expect(
      screen.queryByText("Your verification session expired. Please log in again."),
    ).not.toBeInTheDocument();
  });

  it("does not carry redirect-error placement into a later local-login MFA challenge after clicking Back (#2022)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ requiresMfa: true, mfaToken: "local-mfa-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ error: "MFA session expired", code: "MFA_EXPIRED" }),
        }),
    );

    renderLoginPage("/login?mfaToken=abc-123", undefined, { ssoEnforced: true });

    await screen.findByPlaceholderText("000000");
    fireEvent.click(screen.getByRole("button", { name: /^back$/i }));

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }));

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    const errorEl = await screen.findByText(
      "Your verification session expired. Please log in again.",
    );
    const form = screen.getByLabelText(/username/i).closest("form");
    expect(errorEl.closest("form")).toBe(form);
    await waitFor(() => expect(screen.getByLabelText(/username/i)).toHaveFocus());
  });

  it.each([
    ["oidc_auth_failed", "Authentication failed. Please try again."],
    ["oidc_provider_unreachable", "Could not reach the identity provider. Please try again later."],
    ["oidc_session_expired", "Login session expired. Please try again."],
    [
      "oidc_user_not_authorized",
      "Your account is not authorized to access this application. Contact your administrator.",
    ],
    ["oidc_user_limit_reached", "User limit reached. Contact your administrator."],
    ["saml_auth_failed", "SAML authentication failed. Please try again."],
    [
      "saml_user_not_authorized",
      "Your account is not authorized to access this application. Contact your administrator.",
    ],
    ["saml_user_limit_reached", "User limit reached. Contact your administrator."],
    [
      "mfa_enrollment_required",
      "Your organization requires multi-factor authentication. Please set up MFA in your account settings.",
    ],
    [
      "mfa_policy_unavailable",
      "The MFA policy could not be checked. Please try again in a moment.",
    ],
    ["unrecognized_sso_error", "Authentication error. Please try again."],
  ])(
    "renders ?error=%s outside the dimmed local form above the SSO buttons when ssoEnforced is on (#2777)",
    (code, expectedText) => {
      renderLoginPage(`/login?error=${code}`, undefined, { ssoEnforced: true });

      const errorEl = screen.getByText(expectedText);
      const form = screen.getByLabelText(/username/i).closest("form");
      const ssoLink = screen.getByRole("link", { name: /sign in with test idp/i });
      expect(form).not.toBeNull();
      expect(form).toHaveClass("opacity-60");
      expect(errorEl.closest("form")).toBeNull();
      expect(errorEl.closest(".opacity-60")).toBeNull();
      expect(
        errorEl.compareDocumentPosition(ssoLink) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        errorEl.compareDocumentPosition(form as Node) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    },
  );

  it("moves the error back inside the local form when a local login is submitted after an ?error= redirect (#2777)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        headers: new Headers(),
        json: async () => ({ error: "Invalid credentials" }),
      }),
    );

    renderLoginPage("/login?error=oidc_auth_failed", undefined, { ssoEnforced: true });

    const redirectErrorEl = screen.getByText("Authentication failed. Please try again.");
    expect(redirectErrorEl.closest("form")).toBeNull();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "wrong" } });
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }));

    const invalidEl = await screen.findByText(/invalid username or password/i);
    const form = screen.getByLabelText(/username/i).closest("form");
    expect(invalidEl.closest("form")).toBe(form);
    expect(screen.queryByText("Authentication failed. Please try again.")).not.toBeInTheDocument();
  });

  it("does not carry redirect-error placement into a later local-login MFA challenge after an ?error= redirect (#2777)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers(),
          json: async () => ({ requiresMfa: true, mfaToken: "local-mfa-token" }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          headers: new Headers(),
          json: async () => ({ error: "MFA session expired", code: "MFA_EXPIRED" }),
        }),
    );

    renderLoginPage("/login?error=oidc_auth_failed", undefined, { ssoEnforced: true });

    expect(screen.getByText("Authentication failed. Please try again.").closest("form")).toBeNull();

    fireEvent.change(screen.getByLabelText(/username/i), { target: { value: "admin" } });
    fireEvent.change(screen.getByLabelText(/password/i), { target: { value: "correct-password" } });
    fireEvent.click(screen.getByRole("button", { name: /^login$/i }));

    const codeInput = await screen.findByPlaceholderText("000000");
    fireEvent.change(codeInput, { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: /^verify$/i }));

    const errorEl = await screen.findByText(
      "Your verification session expired. Please log in again.",
    );
    const form = screen.getByLabelText(/username/i).closest("form");
    expect(errorEl.closest("form")).toBe(form);
    await waitFor(() => expect(screen.getByLabelText(/username/i)).toHaveFocus());
  });
});
