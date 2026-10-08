// @vitest-environment jsdom

/**
 * A logout the server never answered must not look like a logout (#1558).
 * The httpOnly session cookie can't be cleared by the client, so clearing the
 * local token and redirecting on a failed request leaves the session alive on
 * a machine the user believes they've left.
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
import { appUrl } from "@/lib/app-url";

const FAILURE_MESSAGE = "Couldn't sign you out. Try again.";

let navigatedTo: string[];
let logoutCalls: Array<RequestInit | undefined>;

function stubLogout(respond: () => Promise<unknown>) {
  logoutCalls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/api/auth/logout")) {
        logoutCalls.push(init);
        return respond();
      }
      throw new Error(`unexpected fetch in test: ${url}`);
    }),
  );
}

const okResponse = () =>
  Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true }) });
const serverError = () =>
  Promise.resolve({ ok: false, status: 500, json: async () => ({ error: "boom" }) });
const networkDown = () => Promise.reject(new TypeError("Failed to fetch"));

beforeEach(() => {
  storage.clear();
  storage.set("snapotter-token", "tok-123");
  storage.set("snapotter-username", "ada");
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

async function renderAvatarAndLogOut() {
  render(
    <I18nProvider>
      <AvatarDropdown onSettingsClick={() => {}} />
    </I18nProvider>,
  );
  fireEvent.click(screen.getByTestId("user-menu"));
  fireEvent.click(screen.getByRole("button", { name: "Log out" }));
}

async function renderSettingsAndLogOut() {
  render(
    <I18nProvider>
      <SettingsDialog open onClose={() => {}} />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Log out" }));
}

describe.each([
  ["avatar menu", renderAvatarAndLogOut],
  ["settings dialog", renderSettingsAndLogOut],
])("logging out from the %s", (_name, logOut) => {
  it.each([
    ["the request fails", networkDown],
    ["the server answers non-OK", serverError],
  ])("keeps the user signed in and says so when %s", async (_label, respond) => {
    stubLogout(respond);

    await logOut();

    expect(await screen.findByText(FAILURE_MESSAGE)).toBeInTheDocument();
    expect(navigatedTo).toEqual([]);
    expect(storage.get("snapotter-token")).toBe("tok-123");
    expect(storage.get("snapotter-username")).toBe("ada");
  });

  it("treats a 200 that isn't the API's { ok: true } as a failure", async () => {
    stubLogout(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }),
    );

    await logOut();

    expect(await screen.findByText(FAILURE_MESSAGE)).toBeInTheDocument();
    expect(navigatedTo).toEqual([]);
    expect(storage.get("snapotter-token")).toBe("tok-123");
  });

  it("follows the IdP logoutUrl from an OK answer", async () => {
    const logoutUrl = "https://idp.example/oidc/logout?id_token_hint=t";
    stubLogout(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, logoutUrl }) }),
    );

    await logOut();

    await waitFor(() => expect(navigatedTo).toEqual([logoutUrl]));
  });

  it("still leaves when the browser refuses to clear its storage", async () => {
    stubLogout(okResponse);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: () => {},
      removeItem: () => {
        throw new DOMException("blocked", "SecurityError");
      },
      clear: () => {},
    });

    await logOut();

    await waitFor(() => expect(navigatedTo).toEqual([appUrl("/login")]));
  });

  it("sends the bearer token so a token session reaches the server", async () => {
    stubLogout(okResponse);

    await logOut();

    await waitFor(() => expect(logoutCalls).toHaveLength(1));
    const headers = new Headers(logoutCalls[0]?.headers);
    expect(headers.get("Authorization")).toBe("Bearer tok-123");
  });

  it("clears local state and goes to login once the server answers OK", async () => {
    stubLogout(okResponse);

    await logOut();

    await waitFor(() => expect(navigatedTo).toEqual([appUrl("/login")]));
    expect(storage.has("snapotter-token")).toBe(false);
    expect(storage.has("snapotter-username")).toBe(false);
  });
});

describe("retrying a failed logout", () => {
  it("avatar menu: the error stays visible and a second click can succeed", async () => {
    stubLogout(networkDown);
    await renderAvatarAndLogOut();
    expect(await screen.findByText(FAILURE_MESSAGE)).toBeInTheDocument();

    stubLogout(okResponse);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(navigatedTo).toEqual([appUrl("/login")]));
    expect(storage.has("snapotter-token")).toBe(false);
  });

  it("avatar menu: closing the menu drops the error", async () => {
    stubLogout(networkDown);
    await renderAvatarAndLogOut();
    expect(await screen.findByText(FAILURE_MESSAGE)).toBeInTheDocument();

    fireEvent.mouseDown(document.body);
    fireEvent.click(screen.getByTestId("user-menu"));

    expect(screen.queryByText(FAILURE_MESSAGE)).not.toBeInTheDocument();
  });

  it("settings dialog: the error stays visible and a second click can succeed", async () => {
    stubLogout(serverError);
    await renderSettingsAndLogOut();
    expect(await screen.findByText(FAILURE_MESSAGE)).toBeInTheDocument();

    stubLogout(okResponse);
    fireEvent.click(screen.getByRole("button", { name: "Log out" }));

    await waitFor(() => expect(navigatedTo).toEqual([appUrl("/login")]));
    expect(storage.has("snapotter-token")).toBe(false);
  });
});
