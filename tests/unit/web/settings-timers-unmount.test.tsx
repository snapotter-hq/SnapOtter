// @vitest-environment jsdom

/**
 * Settings screens fade their "saved" / "copied" / action messages out on a
 * 2 to 3 second timer. Closing Settings before it fires must cancel it: a
 * timer left behind fires into an unmounted tree, and in the unit run it fired
 * after jsdom was torn down, failing the job with "window is not defined"
 * after every test had passed (#1619).
 *
 * setTimeout is faked (advancing with real time so findBy* still polls), so a
 * leaked timer shows up in vi.getTimerCount() and never outlives this file.
 */

import "@testing-library/jest-dom/vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { de } from "@snapotter/shared/i18n/de.js";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// No working localStorage in this jsdom env (same stub as settings-api-errors).
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
const copyToClipboard = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPost, apiPut, apiDelete };
});

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, copyToClipboard };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
    update() {}
  },
}));

import {
  AdminSecuritySettings,
  ApiKeysSection,
  PeopleSection,
  RolesSection,
  SettingsDialog,
  SystemSection,
  TeamsSection,
} from "@/components/settings/settings-dialog";
import { TwoFactorSettings } from "@/components/settings/two-factor-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { format } from "@/lib/format";

const s = de.settings;

const user = {
  id: "u1",
  username: "ada",
  role: "user",
  team: "Default",
  createdAt: "2026-01-01T00:00:00Z",
};
const team = {
  id: "t1",
  name: "Design",
  memberCount: 0,
  storageQuota: null,
  retentionHours: null,
  createdAt: "2026-01-01T00:00:00Z",
};
const role = {
  id: "r1",
  name: "auditor",
  description: "Reads the audit log",
  permissions: ["audit:read"],
  isBuiltin: false,
  userCount: 0,
};

function renderDe(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"], shouldAdvanceTime: true });
  storage.clear();
  storage.set("snapotter-locale", "de");
  useAuth.mockReturnValue({
    permissions: [],
    hasPermission: () => false,
    authEnabled: true,
    role: "admin",
    totpEnabled: false,
  });
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/auth/session"))
      return { user: { id: 1, username: "ada", role: "admin" } };
    if (path.startsWith("/v1/preferences")) return { preferences: {} };
    if (path.startsWith("/auth/users")) return { users: [user], maxUsers: 5 };
    if (path.startsWith("/v1/teams")) return { teams: [team] };
    if (path.startsWith("/v1/roles")) return { roles: [role] };
    if (path.startsWith("/v1/settings")) return { settings: {} };
    if (path.startsWith("/v1/api-keys")) return { apiKeys: [] };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.stubGlobal("confirm", () => true);
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const mock of [apiGet, apiPost, apiPut, apiDelete, useAuth]) mock.mockReset();
  copyToClipboard.mockClear();
});

type Flow = [name: string, run: () => Promise<void>];

const flows: Flow[] = [
  [
    "General: saving preferences (via the dialog)",
    async () => {
      apiPut.mockResolvedValueOnce({});
      renderDe(<SettingsDialog open onClose={() => {}} />);
      fireEvent.click(await screen.findByRole("button", { name: s.general.saveButton }));
      await screen.findByText(s.general.saveSuccess);
    },
  ],
  [
    "System: saving settings",
    async () => {
      apiPut.mockRejectedValueOnce(new Error("down"));
      renderDe(<SystemSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
      await screen.findByText(s.system.saveFailed);
    },
  ],
  [
    "Admin security: saving settings",
    async () => {
      apiPut.mockRejectedValueOnce(new Error("down"));
      renderDe(<AdminSecuritySettings />);
      fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
      await screen.findByText(s.security.securitySettingsFailed);
    },
  ],
  [
    "People: adding a user",
    async () => {
      apiPost.mockResolvedValueOnce({});
      renderDe(<PeopleSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.people.addMembersButton }));
      fireEvent.change(screen.getByPlaceholderText(s.people.usernamePlaceholder), {
        target: { value: "grace" },
      });
      fireEvent.change(screen.getByPlaceholderText(de.auth.password), {
        target: { value: "ValidPass1" },
      });
      fireEvent.click(screen.getByRole("button", { name: de.common.create }));
      await screen.findByText(s.people.createSuccess);
    },
  ],
  [
    "People: deleting a user",
    async () => {
      apiDelete.mockResolvedValueOnce({});
      renderDe(<PeopleSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
      fireEvent.click(screen.getByText(s.people.deleteUserAction));
      await screen.findByText(format(s.people.deleteSuccess, { username: "ada" }));
    },
  ],
  [
    "People: copying a generated password",
    async () => {
      renderDe(<PeopleSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.people.addMembersButton }));
      fireEvent.click(screen.getByRole("button", { name: de.changePassword.generateButton }));
      const copy = screen.getByPlaceholderText(de.auth.password).parentElement as HTMLElement;
      const before = vi.getTimerCount();
      await act(async () => {
        fireEvent.click(within(copy).getByRole("button"));
      });
      expect(copyToClipboard).toHaveBeenCalled();
      expect(vi.getTimerCount()).toBeGreaterThan(before);
    },
  ],
  [
    "API keys: copying a new key",
    async () => {
      apiPost.mockResolvedValueOnce({ key: "si_secret" });
      renderDe(<ApiKeysSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.apiKeys.generateButton }));
      await screen.findByText("si_secret");
      const before = vi.getTimerCount();
      await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: de.common.copy }));
      });
      expect(copyToClipboard).toHaveBeenCalledWith("si_secret");
      expect(vi.getTimerCount()).toBeGreaterThan(before);
    },
  ],
  [
    "Teams: deleting a team",
    async () => {
      apiDelete.mockResolvedValueOnce({});
      renderDe(<TeamsSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
      fireEvent.click(within(screen.getByRole("menu")).getByText(s.teams.deleteAction));
      await screen.findByText(format(s.teams.deleteSuccess, { name: "Design" }));
    },
  ],
  [
    "Roles: deleting a role",
    async () => {
      apiDelete.mockResolvedValueOnce({});
      renderDe(<RolesSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.a11y.deleteRole }));
      await screen.findByText(format(s.roles.deleteSuccess, { name: "auditor" }));
    },
  ],
  [
    "Two-factor: copying recovery codes",
    async () => {
      apiPost.mockResolvedValueOnce({ uri: "otpauth://totp/x?secret=ABC", recoveryCodes: ["a"] });
      renderDe(<TwoFactorSettings />);
      fireEvent.click(
        await screen.findByRole("button", { name: s.security.enableTwoFactorButton }),
      );
      fireEvent.click(
        await screen.findByRole("button", { name: s.security.twoFactorCopyRecoveryCodes }),
      );
      await screen.findByText(s.security.twoFactorCodesCopied);
    },
  ],
];

describe("Settings timers are cancelled when Settings closes", () => {
  it.each(flows)("%s", async (_name, run) => {
    await run();
    // The fade-out timer is pending while the screen is up...
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    // ...and closing Settings leaves nothing scheduled to fire later.
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("schedules nothing when a save settles after Settings has closed", async () => {
    let settle: (value: unknown) => void = () => {};
    apiPut.mockReturnValueOnce(
      new Promise((resolve) => {
        settle = resolve;
      }),
    );
    renderDe(<AdminSecuritySettings />);
    fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
    expect(apiPut).toHaveBeenCalled();

    cleanup();
    settle({});
    await act(async () => {});
    expect(vi.getTimerCount()).toBe(0);
  });

  it("still clears the message after 3 seconds while Settings stays open", async () => {
    apiPut.mockRejectedValueOnce(new Error("down"));
    renderDe(<AdminSecuritySettings />);
    fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
    await screen.findByText(s.security.securitySettingsFailed);

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(screen.queryByText(s.security.securitySettingsFailed)).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("Settings components schedule no raw timers", () => {
  // A bare setTimeout in a component outlives an unmount. Use the
  // useTimeouts() hook, which clears pending timers when the component goes.
  const dir = join(__dirname, "../../../apps/web/src/components/settings");
  const files = readdirSync(dir).filter((f) => f.endsWith(".tsx"));

  it.each(files)("%s", (file) => {
    const offenders = readFileSync(join(dir, file), "utf8")
      .split("\n")
      .flatMap((line, i) => (/\bsetTimeout\s*\(/.test(line) ? [`${i + 1}: ${line.trim()}`] : []));
    expect(offenders).toEqual([]);
  });
});
