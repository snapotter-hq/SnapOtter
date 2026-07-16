// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  vi.unstubAllGlobals();
});

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

describe("LoginPage error messages", () => {
  it("shows the MFA enrollment message when the API returns MFA_ENROLLMENT_REQUIRED", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: "MFA enrollment is required before login",
          code: "MFA_ENROLLMENT_REQUIRED",
        }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/multi-factor authentication/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/invalid username or password/i)).not.toBeInTheDocument();
  });

  it("still shows a generic message for a plain invalid-credentials response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ error: "Invalid credentials" }),
      }),
    );

    renderLoginPage();
    await submitLogin();

    await waitFor(() => {
      expect(screen.getByText(/invalid username or password/i)).toBeInTheDocument();
    });
  });
});
