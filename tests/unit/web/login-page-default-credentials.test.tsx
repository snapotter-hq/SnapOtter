// @vitest-environment jsdom

// A first-run user must see admin / admin on the login page while those are
// still the live credentials, and never after (#4817).

import "@testing-library/jest-dom/vitest";
import { cleanup, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();

vi.mock("@/stores/connection-store", () => ({
  useConnectionStore: { subscribe: () => () => {} },
}));

vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Headers(),
  clearToken: vi.fn(),
  setToken: vi.fn(),
}));

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  vi.unstubAllGlobals();
  vi.resetModules();
});

function respond(authConfig: Record<string, unknown>, sessionStatus: number) {
  fetchMock.mockImplementation(async (url: string) => {
    if (url.endsWith("/api/v1/config/auth")) {
      return { ok: true, status: 200, json: async () => authConfig };
    }
    if (url.endsWith("/api/auth/session")) {
      return {
        ok: sessionStatus === 200,
        status: sessionStatus,
        json: async () => ({ user: { username: "admin", role: "admin", permissions: [] } }),
      };
    }
    return { ok: false, status: 404, json: async () => ({}) };
  });
  vi.stubGlobal("fetch", fetchMock);
}

async function renderLoginPage() {
  const { LoginPage } = await import("@/pages/login-page");
  return render(
    <MemoryRouter initialEntries={["/login"]}>
      <LoginPage />
    </MemoryRouter>,
  );
}

describe("login page default credentials hint", () => {
  it("names admin / admin while the server says the shipped credentials are live", async () => {
    respond({ authEnabled: true, ssoEnforced: false, defaultCredentialsActive: true }, 401);

    await renderLoginPage();

    const hint = await screen.findByTestId("default-credentials-hint");
    expect(hint).toHaveTextContent("admin / admin");
  });

  it("stays hidden once the server says they are not", async () => {
    respond({ authEnabled: true, ssoEnforced: false, defaultCredentialsActive: false }, 401);

    await renderLoginPage();

    await screen.findByLabelText(/username/i);
    expect(screen.queryByTestId("default-credentials-hint")).not.toBeInTheDocument();
  });

  it("stays hidden for a server that predates the field", async () => {
    respond({ authEnabled: true, ssoEnforced: false }, 401);

    await renderLoginPage();

    await screen.findByLabelText(/username/i);
    expect(screen.queryByTestId("default-credentials-hint")).not.toBeInTheDocument();
  });

  it("stays hidden when SSO is enforced", async () => {
    respond({ authEnabled: true, ssoEnforced: true, defaultCredentialsActive: true }, 401);

    await renderLoginPage();

    await screen.findByLabelText(/username/i);
    expect(screen.queryByTestId("default-credentials-hint")).not.toBeInTheDocument();
  });
});

describe("useAuth defaultCredentialsActive", () => {
  it("is false for a signed-in session even if the config still says true", async () => {
    respond({ authEnabled: true, defaultCredentialsActive: true }, 200);
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.defaultCredentialsActive).toBe(false);
  });
});
