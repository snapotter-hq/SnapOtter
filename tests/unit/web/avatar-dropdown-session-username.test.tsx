// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarDropdown } from "@/components/layout/avatar-dropdown";

// This jsdom setup has no working localStorage; same Map-backed stub as
// tool-feedback-prompt.test.tsx.
const storageMap = vi.hoisted(() => new Map<string, string>());
const localStorageMock = vi.hoisted(() => ({
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  key: vi.fn((_index: number) => null),
  get length() {
    return storageMap.size;
  },
}));

/**
 * Issue #862: the avatar dropdown showed "admin" for every OIDC user. The
 * localStorage key it read ("snapotter-username") is written only by the
 * password login form; an OIDC login round-trips through the IdP and lands
 * back with just a session cookie, so the key stays unset forever and the
 * "admin" fallback wins. The dropdown must read the username from the
 * session endpoint, which knows it for every login method.
 *
 * These tests use the real useAuth hook against a stubbed fetch, so they
 * cover the whole client chain: /api/auth/session -> useAuth -> dropdown.
 */

const AUTH_CONFIG = {
  authEnabled: true,
  oidcEnabled: true,
  oidcProviderName: "Microsoft",
  samlEnabled: false,
  samlProviderName: null,
  ssoEnforced: false,
};

function sessionPayload(username: string) {
  return {
    user: {
      id: "user-oidc-1",
      username,
      role: "user",
      mustChangePassword: false,
      permissions: ["tools:use", "files:own"],
      authProvider: "oidc",
      loginMethod: "oidc",
      email: "alex.bauer@contoso.com",
      hasLocalPassword: false,
      hasOidcLink: true,
      totpEnabled: false,
    },
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
  };
}

function stubFetch(sessionImpl: () => Promise<unknown>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/config/auth")) {
        return { ok: true, status: 200, json: async () => AUTH_CONFIG };
      }
      if (url.includes("/api/auth/session")) {
        return sessionImpl();
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    }),
  );
}

const okSession = (body: unknown) => () =>
  Promise.resolve({ ok: true, status: 200, json: async () => body });

const failedSession = (status: number) => () =>
  Promise.resolve({ ok: false, status, json: async () => ({ error: "no session" }) });

/**
 * The logout item renders only once useAuth's 401/session branch has set
 * authEnabled, so waiting for it proves the post-fetch render committed.
 * Waiting on fetch call counts alone can resolve on the config fetch and
 * assert against the pre-settle render.
 */
async function waitForSessionSettled() {
  await waitFor(() => expect(screen.getByText("Log out")).toBeInTheDocument());
}

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvatarDropdown username source (#862)", () => {
  it("shows the session username after an OIDC login that never wrote localStorage", async () => {
    stubFetch(okSession(sessionPayload("alex.bauer_contoso.com")));

    render(<AvatarDropdown onSettingsClick={() => {}} />);

    const button = screen.getByTestId("user-menu");
    await waitFor(() => expect(button).toHaveAttribute("aria-label", "alex.bauer_contoso.com"));

    fireEvent.click(button);
    expect(screen.getByText("alex.bauer_contoso.com")).toBeInTheDocument();
    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });

  it("prefers the session username over a stale localStorage value", async () => {
    localStorage.setItem("snapotter-username", "renamed-away");
    stubFetch(okSession(sessionPayload("alex.bauer_contoso.com")));

    render(<AvatarDropdown onSettingsClick={() => {}} />);

    await waitFor(() =>
      expect(screen.getByTestId("user-menu")).toHaveAttribute(
        "aria-label",
        "alex.bauer_contoso.com",
      ),
    );
  });

  it("still falls back to the localStorage username when no session is available", async () => {
    localStorage.setItem("snapotter-username", "carol");
    stubFetch(failedSession(401));

    render(<AvatarDropdown onSettingsClick={() => {}} />);

    const button = screen.getByTestId("user-menu");
    // Pre-fetch render: localStorage bridges the loading gap.
    expect(button).toHaveAttribute("aria-label", "carol");

    // The settled 401 must not knock the dropdown back to the "admin" fallback.
    fireEvent.click(button);
    await waitForSessionSettled();
    expect(button).toHaveAttribute("aria-label", "carol");
  });

  it("shows no name rather than the admin fallback while the session is loading", async () => {
    // Session fetch never resolves: an OIDC user (empty localStorage) on a slow
    // link must not be labeled "admin" in the meantime; that is the #862
    // symptom flashing back.
    stubFetch(() => new Promise(() => {}));

    render(<AvatarDropdown onSettingsClick={() => {}} />);

    const button = screen.getByTestId("user-menu");
    expect(button).toHaveAttribute("aria-label", "");
    expect(screen.queryByText("admin")).not.toBeInTheDocument();
  });

  it("falls back past a session payload that carries no username", async () => {
    // Not producible by today's API (users.username is NOT NULL and the session
    // route always sends it); pins that a trimmed payload degrades to the
    // fallback chain instead of a blank or crashed dropdown.
    localStorage.setItem("snapotter-username", "carol");
    stubFetch(okSession({ user: { id: "user-1", role: "user" }, expiresAt: null }));

    render(<AvatarDropdown onSettingsClick={() => {}} />);

    const button = screen.getByTestId("user-menu");
    fireEvent.click(button);
    await waitForSessionSettled();
    expect(button).toHaveAttribute("aria-label", "carol");
  });
});
