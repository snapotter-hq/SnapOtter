// @vitest-environment jsdom

/**
 * The Generate button on the Add user form sizes the password to the
 * server's minimum length, which can be anywhere from 1 to 128, instead of
 * always making 20 characters (#2027). An admin can read the policy; when the
 * read fails the default length still applies.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as settings-api-errors.test.tsx).
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

const apiGet = vi.hoisted(() => vi.fn());
const apiPost = vi.hoisted(() => vi.fn());
const apiPut = vi.hoisted(() => vi.fn());
const apiDelete = vi.hoisted(() => vi.fn());
const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPost, apiPut, apiDelete };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
    update() {}
  },
}));

import { PeopleSection } from "@/components/settings/settings-dialog";
import { I18nProvider } from "@/contexts/i18n-context";

let settingsRead: () => Promise<{ settings: Record<string, string> }>;

beforeEach(() => {
  storage.clear();
  storage.set("snapotter-locale", "en");
  useAuth.mockReturnValue({
    permissions: [],
    hasPermission: () => false,
    authEnabled: true,
    role: "admin",
    totpEnabled: false,
  });
  settingsRead = async () => ({ settings: {} });
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/auth/users")) return { users: [], maxUsers: 5 };
    if (path.startsWith("/v1/teams")) return { teams: [] };
    if (path.startsWith("/v1/roles")) return { roles: [] };
    if (path.startsWith("/v1/settings")) return settingsRead();
    throw new Error(`unexpected GET ${path}`);
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const mock of [apiGet, apiPost, apiPut, apiDelete, useAuth]) mock.mockReset();
});

async function generate() {
  render(
    <I18nProvider>
      <PeopleSection />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: en.settings.people.addMembersButton }));
  fireEvent.click(screen.getByRole("button", { name: en.changePassword.generateButton }));
  const input = screen.getByPlaceholderText(en.auth.password) as HTMLInputElement;
  return { input };
}

describe("Add user: Generate password", () => {
  it("meets a minimum length above the default", async () => {
    settingsRead = async () => ({ settings: { passwordMinLength: "24" } });
    const { input } = await generate();
    await waitFor(() => expect(input.value).toHaveLength(24));
  });

  it("keeps the default length when the minimum is lower", async () => {
    settingsRead = async () => ({ settings: { passwordMinLength: "8" } });
    const { input } = await generate();
    await waitFor(() => expect(input.value).toHaveLength(20));
  });

  it("falls back to the default length when the policy cannot be read", async () => {
    settingsRead = async () => {
      throw new Error("403");
    };
    const { input } = await generate();
    await waitFor(() => expect(input.value).toHaveLength(20));
  });
});
