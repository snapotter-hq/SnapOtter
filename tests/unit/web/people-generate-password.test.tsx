// @vitest-environment jsdom

/**
 * The Generate button on the Add user form sizes the password to the
 * server's minimum length, which can be anywhere from 1 to 128, instead of
 * always making 20 characters (#2027). The policy is read once when the section
 * mounts; when that read fails the default length still applies.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
import { ApiError } from "@/lib/api";
import { format } from "@/lib/format";

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

async function openAddForm() {
  render(
    <I18nProvider>
      <PeopleSection />
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: en.settings.people.addMembersButton }));
  // Let the policy read that ran on mount settle before Generate uses it.
  await act(async () => {});
}

const generateButton = () => screen.getByRole("button", { name: en.changePassword.generateButton });
const passwordInput = () => screen.getByPlaceholderText(en.auth.password) as HTMLInputElement;

async function generate() {
  await openAddForm();
  fireEvent.click(generateButton());
  return { input: passwordInput() };
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
    vi.spyOn(console, "warn").mockImplementation(() => {});
    settingsRead = async () => {
      throw new Error("503");
    };
    const { input } = await generate();
    await waitFor(() => expect(input.value).toHaveLength(20));
  });

  it("falls back to the default length when the settings map leaves the key out", async () => {
    // An admin with settings:read but not security:manage gets a 200 without it.
    settingsRead = async () => ({ settings: { maxUsers: "5" } });
    const { input } = await generate();
    await waitFor(() => expect(input.value).toHaveLength(20));
  });

  it("learns the minimum from the server's refusal when the policy read gave nothing", async () => {
    settingsRead = async () => ({ settings: {} });
    apiPost.mockRejectedValueOnce(
      new ApiError("refused", 400, "VALIDATION_ERROR", {
        code: "VALIDATION_ERROR",
        rule: "minLength",
        rules: ["minLength"],
        minLength: 24,
      }),
    );
    await openAddForm();
    fireEvent.change(screen.getByPlaceholderText(en.settings.people.usernamePlaceholder), {
      target: { value: "grace" },
    });
    fireEvent.click(generateButton());
    expect(passwordInput().value).toHaveLength(20);

    fireEvent.click(screen.getByRole("button", { name: en.common.create }));
    expect(
      await screen.findByText(format(en.errors.passwordTooShort, { minLength: 24 })),
    ).toBeInTheDocument();

    fireEvent.click(generateButton());
    expect(passwordInput().value).toHaveLength(24);
  });
});

describe("Add user: a failed policy read", () => {
  const policyWarning = "Password policy read failed; Generate uses the default length";

  it("is quiet for a 403, the expected answer without access", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    settingsRead = async () => {
      throw new ApiError("forbidden", 403, "FORBIDDEN", { code: "FORBIDDEN" });
    };
    await openAddForm();
    expect(warn).not.toHaveBeenCalledWith(policyWarning, expect.anything());
  });

  it("is logged for anything else", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const failure = new ApiError("down", 500, undefined, { error: "down" });
    settingsRead = async () => {
      throw failure;
    };
    await openAddForm();
    expect(warn).toHaveBeenCalledWith(policyWarning, failure);
  });
});
