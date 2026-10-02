// @vitest-environment jsdom

/**
 * The logout response's logoutUrl comes from the IdP's discovery document,
 * and both logout buttons assign it to window.location.href. A javascript: or
 * data: URL there would run in SnapOtter's origin, so the web app only follows
 * an http(s) logoutUrl and sends anything else to the login page (#1855). The
 * API drops such endpoints too; this is the second check.
 */

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());
const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return {
    ...actual,
    apiGet: vi.fn(async (path: string) => {
      if (path.startsWith("/auth/session"))
        return { user: { id: 1, username: "ada", role: "admin" } };
      if (path.startsWith("/v1/preferences")) return { preferences: {} };
      throw new Error(`unexpected GET ${path}`);
    }),
  };
});

vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
    update() {}
  },
}));

import { AvatarDropdown } from "@/components/layout/avatar-dropdown";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { I18nProvider } from "@/contexts/i18n-context";
import { logoutDestination } from "@/lib/logout-destination";

const HOSTILE = [
  "javascript:alert(document.domain)",
  "JavaScript:alert(1)",
  " javascript:alert(1)",
  "\tjava\nscript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
  "vbscript:msgbox(1)",
  "file:///etc/passwd",
  "blob:https://idp.example/abc",
  "/relative/logout",
  "//evil.example/logout",
  "not a url",
  "",
];

describe("logoutDestination", () => {
  it.each([
    "https://idp.example/oidc/logout?id_token_hint=t&post_logout_redirect_uri=x",
    "http://localhost:8080/realms/dev/protocol/openid-connect/logout?id_token_hint=t",
    "HTTPS://IDP.EXAMPLE/logout",
  ])("follows the http(s) logoutUrl %s", (url) => {
    expect(logoutDestination(url)).toBe(url);
  });

  it.each(HOSTILE)("sends %j to the login page instead", (url) => {
    expect(logoutDestination(url)).toBe("/login");
  });

  it.each([undefined, null, 42, { href: "https://idp.example/" }, ["https://idp.example/"]])(
    "sends a non-string logoutUrl (%j) to the login page",
    (value) => {
      expect(logoutDestination(value)).toBe("/login");
    },
  );
});

// window.location.href assignment, captured instead of navigating jsdom.
let navigatedTo: string[];

function stubLogoutResponse(body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/api/auth/logout")) {
        return { ok: true, status: 200, json: async () => body };
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    }),
  );
}

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  });
  navigatedTo = [];
  vi.stubGlobal("location", {
    get href() {
      return navigatedTo.at(-1) ?? "http://localhost/";
    },
    set href(value: string) {
      navigatedTo.push(value);
    },
  });
  useAuth.mockReturnValue({
    authEnabled: true,
    loading: false,
    username: "ada",
    role: "admin",
    permissions: [],
    hasPermission: () => false,
    totpEnabled: false,
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAuth.mockReset();
});

async function logOutFromAvatarMenu() {
  render(
    <I18nProvider>
      <AvatarDropdown onSettingsClick={() => {}} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByTestId("user-menu"));
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
  await waitFor(() => expect(navigatedTo).toHaveLength(1));
}

async function logOutFromSettings() {
  render(
    <I18nProvider>
      <SettingsDialog open onClose={() => {}} />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Log out" }));
  await waitFor(() => expect(navigatedTo).toHaveLength(1));
}

describe.each([
  ["avatar menu", logOutFromAvatarMenu],
  ["settings dialog", logOutFromSettings],
])("logging out from the %s", (_name, logOut) => {
  it.each([
    "javascript:alert(document.domain)?id_token_hint=t",
    "data:text/html,<script>alert(1)</script>",
  ])("goes to the login page, not to a logoutUrl of %j (#1855)", async (logoutUrl) => {
    stubLogoutResponse({ ok: true, logoutUrl });

    await logOut();

    expect(navigatedTo).toEqual(["/login"]);
  });

  it("follows an https logoutUrl to the IdP", async () => {
    const logoutUrl = "https://idp.example/oidc/logout?id_token_hint=t";
    stubLogoutResponse({ ok: true, logoutUrl });

    await logOut();

    expect(navigatedTo).toEqual([logoutUrl]);
  });

  it("goes to the login page when the response has no logoutUrl", async () => {
    stubLogoutResponse({ ok: true });

    await logOut();

    expect(navigatedTo).toEqual(["/login"]);
  });
});
