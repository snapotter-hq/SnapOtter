// @vitest-environment jsdom

/**
 * Settings error messages must persist until the next action or explicit
 * dismissal, not vanish after 3 seconds (WCAG 2.2.1 Timing Adjustable).
 * Error messages must have role="alert" and success messages must have
 * role="status" (#1583).
 */

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
const captureHandledError = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet, apiPost, apiPut, apiDelete };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth }));
vi.mock("@/lib/analytics", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, captureHandledError };
});

vi.mock("qr-code-styling", () => ({
  default: class {
    append() {}
    update() {}
  },
}));

import {
  AdminSecuritySettings,
  GeneralSection,
  PeopleSection,
  RolesSection,
  SystemSection,
  TeamsSection,
} from "@/components/settings/settings-dialog";
import { I18nProvider } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { useAnalyticsStore } from "@/stores/analytics-store";

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
    loading: false,
    permissions: ["security:manage", "users:manage", "roles:manage", "teams:manage"],
    hasPermission: () => true,
    authEnabled: true,
    role: "admin",
    hasLocalPassword: true,
    totpEnabled: false,
  });
  useAnalyticsStore.setState({
    config: { enabled: true, posthogApiKey: "test" },
    configLoaded: true,
  });
  apiGet.mockImplementation(async (path: string) => {
    if (path.startsWith("/auth/session"))
      return { user: { id: 1, username: "ada", role: "admin" } };
    if (path.startsWith("/v1/preferences")) return { preferences: {} };
    if (path.startsWith("/auth/users")) return { users: [user], maxUsers: 5 };
    if (path.startsWith("/v1/teams")) return { teams: [team] };
    if (path.startsWith("/v1/roles")) return { roles: [role] };
    if (path.startsWith("/v1/settings")) return { settings: {} };
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
  for (const mock of [apiGet, apiPost, apiPut, apiDelete, useAuth, captureHandledError])
    mock.mockReset();
});

describe("Settings error messages persistence and accessibility (#1583)", () => {
  describe("General: saveMsg", () => {
    it("error message has role='alert', does not clear after 3s, and is dismissible", async () => {
      apiPut.mockRejectedValueOnce(new Error("Network error"));
      renderDe(<GeneralSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.general.saveButton }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.general.saveFailed);

      // Does not disappear after 3 seconds
      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.general.saveFailed);

      // Explicit dismiss button
      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("success message has role='status' and clears after 3s", async () => {
      apiPut.mockResolvedValueOnce({});
      renderDe(<GeneralSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.general.saveButton }));
      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent(s.general.saveSuccess);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("System: saveMsg", () => {
    it("error message has role='alert', does not clear after 3s, and is dismissible", async () => {
      apiPut.mockRejectedValueOnce(new Error("Network error"));
      renderDe(<SystemSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.system.saveFailed);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.system.saveFailed);

      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("success message has role='status' and clears after 3s", async () => {
      apiPut.mockResolvedValueOnce({});
      renderDe(<SystemSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent(s.system.saveSuccess);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });

    it("installFeedbackError has role='alert', does not clear after 3s, and is dismissible", async () => {
      apiPut.mockRejectedValueOnce(new Error("Network error"));
      renderDe(<SystemSection />);
      const remindBtn = await screen.findByRole("button", { name: de.feedback.remindLater });
      fireEvent.click(remindBtn);
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.system.saveFailed);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.system.saveFailed);

      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });
  });

  describe("Security: saveMsg", () => {
    it("error message has role='alert', does not clear after 3s, and is dismissible", async () => {
      apiPut.mockRejectedValueOnce(new Error("Network error"));
      renderDe(<AdminSecuritySettings />);
      fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.security.securitySettingsFailed);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.security.securitySettingsFailed);

      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("success message has role='status' and clears after 3s", async () => {
      apiPut.mockResolvedValueOnce({});
      renderDe(<AdminSecuritySettings />);
      fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent(s.security.securitySettingsSaved);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("People: actionMsg", () => {
    it("error message has role='alert', does not clear after 3s, and is dismissible", async () => {
      apiDelete.mockRejectedValueOnce(new Error("Network error"));
      renderDe(<PeopleSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
      fireEvent.click(screen.getByText(s.people.deleteUserAction));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.people.deleteFailed);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.people.deleteFailed);

      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("success message has role='status' and clears after 3s", async () => {
      apiDelete.mockResolvedValueOnce({});
      renderDe(<PeopleSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
      fireEvent.click(screen.getByText(s.people.deleteUserAction));
      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent(format(s.people.deleteSuccess, { username: "ada" }));

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("Teams: actionMsg", () => {
    it("error message has role='alert', does not clear after 3s, and is dismissible", async () => {
      apiDelete.mockRejectedValueOnce(new Error("Network error"));
      renderDe(<TeamsSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
      fireEvent.click(within(screen.getByRole("menu")).getByText(s.teams.deleteAction));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.teams.deleteFailed);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.teams.deleteFailed);

      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("success message has role='status' and clears after 3s", async () => {
      apiDelete.mockResolvedValueOnce({});
      renderDe(<TeamsSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
      fireEvent.click(within(screen.getByRole("menu")).getByText(s.teams.deleteAction));
      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent(format(s.teams.deleteSuccess, { name: "Design" }));

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("Roles: actionMsg", () => {
    it("validation error has role='alert', does not clear after 3s, and is dismissible", async () => {
      renderDe(<RolesSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.roles.createButton }));
      // Leave permissions empty, name invalid or empty
      fireEvent.change(screen.getByPlaceholderText(s.roles.roleNamePlaceholder), {
        target: { value: "invalid role name with spaces" },
      });
      fireEvent.click(screen.getByRole("button", { name: de.common.create }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.roles.nameInvalid);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.roles.nameInvalid);

      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("error from server has role='alert', does not clear after 3s, and is dismissible", async () => {
      apiDelete.mockRejectedValueOnce(new Error("Network error"));
      renderDe(<RolesSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.a11y.deleteRole }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.roles.deleteFailed);

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.getByRole("alert")).toHaveTextContent(s.roles.deleteFailed);

      const dismissBtn = within(screen.getByRole("alert")).getByRole("button", {
        name: de.common.close,
      });
      fireEvent.click(dismissBtn);
      expect(screen.queryByRole("alert")).toBeNull();
    });

    it("success message has role='status' and clears after 3s", async () => {
      apiDelete.mockResolvedValueOnce({});
      renderDe(<RolesSection />);
      fireEvent.click(await screen.findByRole("button", { name: de.a11y.deleteRole }));
      const status = await screen.findByRole("status");
      expect(status).toHaveTextContent(format(s.roles.deleteSuccess, { name: "auditor" }));

      await act(async () => {
        vi.advanceTimersByTime(3000);
      });
      expect(screen.queryByRole("status")).toBeNull();
    });
  });

  describe("Success followed by error does not prematurely clear error (#1583)", () => {
    it("error message is not wiped out by prior success timer", async () => {
      // First save succeeds at t=0
      apiPut.mockResolvedValueOnce({});
      renderDe(<GeneralSection />);
      fireEvent.click(await screen.findByRole("button", { name: s.general.saveButton }));
      expect(await screen.findByRole("status")).toHaveTextContent(s.general.saveSuccess);

      // Advance 2 seconds (success message is still up, 1s remaining on fade timer)
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // Second save fails at t=2s
      apiPut.mockRejectedValueOnce(new Error("Save failed"));
      fireEvent.click(screen.getByRole("button", { name: s.general.saveButton }));
      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(s.general.saveFailed);

      // Advance another 2 seconds (past the original 3s mark when success timer would have fired)
      await act(async () => {
        vi.advanceTimersByTime(2000);
      });

      // Error message must still be in the document
      expect(screen.getByRole("alert")).toHaveTextContent(s.general.saveFailed);
    });
  });
});
