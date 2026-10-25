// @vitest-environment jsdom

/**
 * Settings screens word a failed request in the UI language, chosen by the
 * API's status and code, never its English `error` text (#1445). The screens
 * run in German, so an English literal left in a handler fails here too.
 * Every rejection carries the sentinel "SERVER-TEXT" as its message: the
 * screen must show the translated copy and never the sentinel.
 */

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as change-password-errors.test.tsx).
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

import {
  AdminSecuritySettings,
  ApiKeysSection,
  GeneralSection,
  PeopleSection,
  RolesSection,
  SecuritySection,
  SystemSection,
  TeamsSection,
  ToolsSection,
} from "@/components/settings/settings-dialog";
import { TwoFactorSettings } from "@/components/settings/two-factor-settings";
import { ToolPalette } from "@/components/tools/tool-palette";
import { I18nProvider } from "@/contexts/i18n-context";
import { ApiError } from "@/lib/api";
import { format } from "@/lib/format";
import { useConnectionStore } from "@/stores/connection-store";

const s = de.settings;
const SERVER_TEXT = "SERVER-TEXT";

/** A rejection as api.ts throws it. */
function apiError(status: number, code?: string, extra: Record<string, unknown> = {}) {
  return new ApiError(SERVER_TEXT, status, code, { error: SERVER_TEXT, code, ...extra });
}

/**
 * A password breaking three rules at once, as the server lists them since
 * #1569: the settings screens used to name only the first (#2090).
 */
const manyRulesRefusal = () =>
  apiError(400, "VALIDATION_ERROR", {
    rule: "minLength",
    rules: ["minLength", "digit", "special"],
    minLength: 12,
  });
const MANY_RULES_MESSAGES = [
  format(de.errors.passwordTooShort, { minLength: 12 }),
  de.errors.passwordNeedsDigit,
  de.errors.passwordNeedsSpecial,
];
const listedMessages = (alert: HTMLElement) =>
  within(alert)
    .getAllByRole("listitem")
    .map((item) => item.textContent);

type Case = [name: string, err: ApiError, expected: string];

/** One table row, named by the status and code it rejects with. */
function reject(
  status: number,
  code: string | undefined,
  expected: string,
  extra: Record<string, unknown> = {},
): Case {
  return [`${status} ${code ?? "(no code)"}`, apiError(status, code, extra), expected];
}

function renderDe(ui: ReactElement) {
  return render(<I18nProvider>{ui}</I18nProvider>);
}

async function expectShown(text: string) {
  expect(await screen.findByText(text)).toBeInTheDocument();
  expect(screen.queryByText(SERVER_TEXT)).toBeNull();
}

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
const apiKey = {
  id: 1,
  name: "ci key",
  prefix: "si_abc",
  createdAt: "2026-01-01T00:00:00Z",
  permissions: null,
  expiresAt: null,
};

beforeEach(() => {
  storage.clear();
  storage.set("snapotter-locale", "de");
  useConnectionStore.setState({ status: "connected", failedSince: null, lastHealthCheck: null });
  useAuth.mockReturnValue({
    loading: false,
    permissions: [],
    hasPermission: () => false,
    authEnabled: true,
    role: "admin",
    hasLocalPassword: true,
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
    if (path.startsWith("/v1/api-keys")) return { apiKeys: [apiKey] };
    throw new Error(`unexpected GET ${path}`);
  });
  vi.stubGlobal("confirm", () => true);
  // A fallback logs the server's reason; keep the run's output clean.
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  for (const mock of [apiGet, apiPost, apiPut, apiDelete, useAuth]) mock.mockReset();
});

describe("Security: change password", () => {
  async function submit(newPassword = "NewPassword1") {
    renderDe(<SecuritySection />);
    fireEvent.change(await screen.findByPlaceholderText(s.security.currentPasswordPlaceholder), {
      target: { value: "OldPassword1" },
    });
    fireEvent.change(screen.getByPlaceholderText(s.security.newPasswordPlaceholder), {
      target: { value: newPassword },
    });
    fireEvent.change(screen.getByPlaceholderText(s.security.confirmPasswordPlaceholder), {
      target: { value: newPassword },
    });
    fireEvent.click(screen.getByRole("button", { name: s.security.changePasswordButton }));
  }

  it("401 INVALID_PASSWORD says the current password is wrong", async () => {
    apiPost.mockRejectedValueOnce(apiError(401, "INVALID_PASSWORD"));
    await submit();
    await expectShown(s.security.currentPasswordIncorrect);
  });

  it("409 PASSWORD_CHANGED says the password was changed elsewhere (#2236)", async () => {
    apiPost.mockRejectedValueOnce(apiError(409, "PASSWORD_CHANGED"));
    await submit();
    await expectShown(s.security.passwordChangedElsewhere);
    expect(screen.queryByText(s.security.changeFailed)).toBeNull();
  });

  it("lets the server's policy answer for a short password, with its own minimum", async () => {
    // No client-side "at least 8" guess: the policy may say 12.
    apiPost.mockRejectedValueOnce(
      apiError(400, "VALIDATION_ERROR", { rule: "minLength", minLength: 12 }),
    );
    await submit("ab");
    await expectShown(format(de.errors.passwordTooShort, { minLength: 12 }));
    expect(apiPost).toHaveBeenCalledWith("/auth/change-password", expect.anything());
  });

  it("500 falls back to the translated failure", async () => {
    apiPost.mockRejectedValueOnce(apiError(500));
    await submit();
    await expectShown(s.security.changeFailed);
  });

  it("lists every broken rule at once instead of one per retry (#2090)", async () => {
    apiPost.mockRejectedValueOnce(manyRulesRefusal());
    await submit("ab");

    expect(listedMessages(await screen.findByRole("alert"))).toEqual(MANY_RULES_MESSAGES);
    expect(screen.queryByText(SERVER_TEXT)).toBeNull();
  });

  it("shows the success message in the same alert slot", async () => {
    apiPost.mockResolvedValueOnce({});
    await submit();

    expect(await screen.findByRole("alert")).toHaveTextContent(s.security.changeSuccess);
  });

  it("answers a lost session in the user's language, not with the generic failure", async () => {
    apiPost.mockRejectedValueOnce(apiError(401, "AUTH_REQUIRED"));
    await submit();

    await expectShown(de.errors.sessionEnded);
    expect(screen.queryByText(s.security.changeFailed)).toBeNull();
  });

  it("403 IP_NOT_ALLOWED says the IP address is not allowed (#2697)", async () => {
    apiPost.mockRejectedValueOnce(apiError(403, "IP_NOT_ALLOWED"));
    await submit();

    await expectShown(de.auth.ipNotAllowed);
    expect(screen.queryByText(s.security.changeFailed)).toBeNull();
  });

  it("shows a rule the server repeats only once", async () => {
    apiPost.mockRejectedValueOnce(
      apiError(400, "VALIDATION_ERROR", {
        rule: "digit",
        rules: ["digit", "digit", "special"],
      }),
    );
    await submit("NoDigitsHere");

    expect(listedMessages(await screen.findByRole("alert"))).toEqual([
      de.errors.passwordNeedsDigit,
      de.errors.passwordNeedsSpecial,
    ]);
  });

  it("keeps a single broken rule as plain text, not a one-item list", async () => {
    apiPost.mockRejectedValueOnce(
      apiError(400, "VALIDATION_ERROR", { rule: "digit", rules: ["digit"] }),
    );
    await submit("NoDigitsHere");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(de.errors.passwordNeedsDigit);
    expect(within(alert).queryByRole("list")).toBeNull();
  });

  it("hides the change-password form for accounts without a local password (#2311)", async () => {
    useAuth.mockReturnValue({
      loading: false,
      permissions: [],
      hasPermission: () => false,
      authEnabled: true,
      role: "user",
      hasLocalPassword: false,
      totpEnabled: false,
    });
    renderDe(<SecuritySection />);

    expect(await screen.findByText(s.security.heading)).toBeInTheDocument();
    expect(screen.getByText(s.security.loginAttemptLimitNote)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(s.security.currentPasswordPlaceholder)).toBeNull();
    expect(screen.queryByRole("button", { name: s.security.changePasswordButton })).toBeNull();
  });

  it("keeps the change-password form visible while the session check is still loading (#2311)", async () => {
    useAuth.mockReturnValue({
      loading: true,
      permissions: [],
      hasPermission: () => false,
      authEnabled: true,
      role: "user",
      hasLocalPassword: false,
      totpEnabled: false,
    });
    renderDe(<SecuritySection />);

    expect(
      await screen.findByPlaceholderText(s.security.currentPasswordPlaceholder),
    ).toBeInTheDocument();
  });
});

describe("Admin security settings: save", () => {
  async function save(err: ApiError) {
    apiPut.mockRejectedValueOnce(err);
    renderDe(<AdminSecuritySettings />);
    fireEvent.click(await screen.findByRole("button", { name: s.system.saveButton }));
  }

  it.each([
    reject(403, "FEATURE_NOT_LICENSED", de.errors.featureNotLicensed),
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(400, "DEPENDENCY_VALIDATION_FAILED", s.security.ssoNeedsProvider),
    reject(401, "AUTH_REQUIRED", de.errors.sessionEnded),
    reject(403, "FORBIDDEN", de.errors.forbidden),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(429, undefined, de.errors.tooManyRequests),
    reject(500, undefined, s.security.securitySettingsFailed),
  ])("%s", async (_name, err, expected) => {
    await save(err);
    await expectShown(expected);
  });

  it("names the setting the server refused, by its label on this tab", async () => {
    await save(apiError(400, "VALIDATION_ERROR", { setting: "passwordMinLength" }));
    await expectShown(format(de.errors.invalidSetting, { setting: s.security.passwordMinLength }));
  });

  it.each([
    ["a setting this tab doesn't show", { setting: "defaultTheme" }],
    ["no setting named", {}],
  ])("400 VALIDATION_ERROR with %s falls back", async (_case, extra) => {
    await save(apiError(400, "VALIDATION_ERROR", extra));
    await expectShown(s.security.securitySettingsFailed);
  });

  it("keeps the server's reason in the console when it falls back", async () => {
    const err = apiError(500);
    await save(err);
    await expectShown(s.security.securitySettingsFailed);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), err);
  });
});

describe("People", () => {
  async function openAddForm(username = "grace") {
    renderDe(<PeopleSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.people.addMembersButton }));
    fireEvent.change(screen.getByPlaceholderText(s.people.usernamePlaceholder), {
      target: { value: username },
    });
    fireEvent.change(screen.getByPlaceholderText(de.auth.password), {
      target: { value: "ValidPass1" },
    });
    fireEvent.click(screen.getByRole("button", { name: de.common.create }));
  }

  it.each([
    reject(409, "CONFLICT", s.people.usernameTaken),
    reject(403, "USER_LIMIT_REACHED", format(s.people.userLimitReached, { max: 5 })),
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(400, "UNKNOWN_ROLE", s.people.roleNotFound),
    reject(400, "UNKNOWN_TEAM", s.people.teamNotFound),
    reject(400, "VALIDATION_ERROR", de.errors.passwordNeedsUppercase, { rule: "uppercase" }),
    reject(429, undefined, de.errors.tooManyRequests),
    reject(500, undefined, s.people.createFailed),
  ])("adding a user: %s", async (_name, err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    await openAddForm();
    await expectShown(expected);
  });

  it.each([
    ["too short", "ab"],
    ["a space", "jane doe"],
    ["an email address", "jane@example.com"],
    ["non-Latin letters", "ユーザー"],
    ["reserved anonymous lowercase (#2469)", "anonymous"],
    ["reserved anonymous mixed case (#2469)", "Anonymous"],
    ["reserved anonymous uppercase (#2469)", "ANONYMOUS"],
  ])("explains the username rule for %s without asking the server", async (_case, username) => {
    await openAddForm(username);
    await expectShown(s.people.usernameInvalid);
    expect(apiPost).not.toHaveBeenCalled();
  });

  async function openUserMenu(action: string) {
    renderDe(<PeopleSection />);
    fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
    fireEvent.click(screen.getByText(action));
  }

  it.each([
    reject(400, "SELF_DEMOTE", s.people.cannotRemoveOwnAdmin),
    reject(400, "LAST_ADMIN", s.people.lastAdmin),
    reject(400, "UNKNOWN_ROLE", s.people.roleNotFound),
    reject(400, "UNKNOWN_TEAM", s.people.teamNotFound),
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(401, "AUTH_REQUIRED", de.errors.sessionEnded),
    reject(403, "FORBIDDEN", de.errors.forbidden),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(500, undefined, s.people.updateFailed),
  ])("editing a user's role or team: %s", async (_name, err, expected) => {
    apiPut.mockRejectedValueOnce(err);
    await openUserMenu(s.people.editRoleTeamAction);
    fireEvent.click(screen.getByRole("button", { name: de.common.save }));
    await expectShown(expected);
  });

  it.each([
    reject(400, "VALIDATION_ERROR", de.errors.passwordNeedsDigit, { rule: "digit" }),
    reject(400, "OIDC_NO_PASSWORD", de.auth.passwordManagedByProvider),
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(500, undefined, s.people.resetFailed),
  ])("resetting a password: %s", async (_name, err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    await openUserMenu(s.people.resetPasswordAction);
    fireEvent.change(screen.getByPlaceholderText(s.people.newPasswordLabel), {
      target: { value: "NoDigitsHere" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));
    await expectShown(expected);
  });

  // A refused password is explained in the reset form, next to the field that
  // caused it, and stays until the admin edits it (#2025). A three-second banner
  // above the member search was easy to miss, and the form stayed open with the
  // rejected value and nothing saying why.
  describe("a password the server refuses on the reset form", () => {
    const refusal = () => apiError(400, "VALIDATION_ERROR", { rule: "digit" });

    async function submitRefusedPassword() {
      apiPost.mockRejectedValueOnce(refusal());
      await openUserMenu(s.people.resetPasswordAction);
      const input = screen.getByPlaceholderText(s.people.newPasswordLabel);
      fireEvent.change(input, { target: { value: "NoDigitsHere" } });
      fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));
      return { input, form: input.closest("form") as HTMLFormElement };
    }

    it("shows the reason inside the form, announced as an alert", async () => {
      const { form } = await submitRefusedPassword();

      const alert = await within(form).findByRole("alert");
      expect(alert).toHaveTextContent(de.errors.passwordNeedsDigit);
      // Not a second copy in the banner above the member list.
      expect(screen.getAllByText(de.errors.passwordNeedsDigit)).toHaveLength(1);
    });

    it("keeps the rejected value and the reason well past the old banner's three seconds", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const { form, input } = await submitRefusedPassword();
        await within(form).findByRole("alert");

        await act(async () => {
          vi.advanceTimersByTime(10_000);
        });

        expect(within(form).getByRole("alert")).toHaveTextContent(de.errors.passwordNeedsDigit);
        expect(input).toHaveValue("NoDigitsHere");
      } finally {
        vi.useRealTimers();
      }
    });

    it("clears the reason when the admin edits the password", async () => {
      const { form, input } = await submitRefusedPassword();
      await within(form).findByRole("alert");

      fireEvent.change(input, { target: { value: "WithDigit1" } });

      expect(within(form).queryByRole("alert")).toBeNull();
    });

    it("does not carry the reason into the next reset form", async () => {
      const { form } = await submitRefusedPassword();
      await within(form).findByRole("alert");

      fireEvent.click(within(form).getByRole("button", { name: de.common.cancel }));
      fireEvent.click(screen.getByRole("button", { name: de.common.actions }));
      fireEvent.click(screen.getByText(s.people.resetPasswordAction));

      const reopened = screen
        .getByPlaceholderText(s.people.newPasswordLabel)
        .closest("form") as HTMLFormElement;
      expect(within(reopened).queryByRole("alert")).toBeNull();
    });

    it("announces the same reason again when the same password is refused twice", async () => {
      // role="alert" only announces a node on insertion, so the old one has to
      // go before the response and a fresh one arrive with it.
      const { form } = await submitRefusedPassword();
      const first = await within(form).findByRole("alert");

      apiPost.mockRejectedValueOnce(refusal());
      fireEvent.click(within(form).getByRole("button", { name: s.people.resetPasswordButton }));

      expect(first).not.toBeInTheDocument();
      expect(await within(form).findByRole("alert")).toHaveTextContent(
        de.errors.passwordNeedsDigit,
      );
    });

    it("drops a banner left by the previous submit when the next one is refused", async () => {
      apiPost.mockRejectedValueOnce(apiError(500));
      await openUserMenu(s.people.resetPasswordAction);
      const input = screen.getByPlaceholderText(s.people.newPasswordLabel);
      const form = input.closest("form") as HTMLFormElement;
      fireEvent.change(input, { target: { value: "ValidPass1" } });
      fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));
      await screen.findByText(s.people.resetFailed);

      apiPost.mockRejectedValueOnce(refusal());
      fireEvent.change(input, { target: { value: "NoDigitsHere" } });
      fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));

      expect(await within(form).findByRole("alert")).toHaveTextContent(
        de.errors.passwordNeedsDigit,
      );
      expect(screen.queryByText(s.people.resetFailed)).toBeNull();
    });

    it("keeps a rate limit in the banner: editing the password can't fix it", async () => {
      apiPost.mockRejectedValueOnce(apiError(429));
      await openUserMenu(s.people.resetPasswordAction);
      const input = screen.getByPlaceholderText(s.people.newPasswordLabel);
      fireEvent.change(input, { target: { value: "ValidPass1" } });
      fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));

      const banner = await screen.findByText(de.errors.tooManyRequests);
      expect(input.closest("form")).not.toContainElement(banner);
      expect(within(input.closest("form") as HTMLFormElement).queryByRole("alert")).toBeNull();
    });

    it("leaves other failures in the banner, outside the form", async () => {
      apiPost.mockRejectedValueOnce(apiError(500));
      await openUserMenu(s.people.resetPasswordAction);
      const input = screen.getByPlaceholderText(s.people.newPasswordLabel);
      fireEvent.change(input, { target: { value: "ValidPass1" } });
      fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));

      const banner = await screen.findByText(s.people.resetFailed);
      expect(input.closest("form")).not.toContainElement(banner);
      expect(within(input.closest("form") as HTMLFormElement).queryByRole("alert")).toBeNull();
    });
  });

  it("adding a user lists every broken password rule at once (#2090)", async () => {
    apiPost.mockRejectedValueOnce(manyRulesRefusal());
    await openAddForm();

    expect(listedMessages(await screen.findByRole("alert"))).toEqual(MANY_RULES_MESSAGES);
    expect(screen.queryByText(SERVER_TEXT)).toBeNull();
  });

  it("resetting a password lists every broken rule inside the form (#2090)", async () => {
    apiPost.mockRejectedValueOnce(manyRulesRefusal());
    await openUserMenu(s.people.resetPasswordAction);
    const input = screen.getByPlaceholderText(s.people.newPasswordLabel);
    fireEvent.change(input, { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));

    const form = input.closest("form") as HTMLFormElement;
    expect(listedMessages(await within(form).findByRole("alert"))).toEqual(MANY_RULES_MESSAGES);
    expect(screen.queryByText(SERVER_TEXT)).toBeNull();
  });

  it.each([
    reject(400, "SELF_DELETE", s.people.cannotDeleteSelf),
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(500, undefined, s.people.deleteFailed),
  ])("deleting a user: %s", async (_name, err, expected) => {
    apiDelete.mockRejectedValueOnce(err);
    await openUserMenu(s.people.deleteUserAction);
    await expectShown(expected);
  });
});

describe("Teams", () => {
  async function openCreateForm() {
    renderDe(<TeamsSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.teams.createButton }));
    return screen.getByPlaceholderText(s.teams.teamNamePlaceholder);
  }

  it.each([
    reject(409, "CONFLICT", s.teams.duplicateName),
    reject(400, "VALIDATION_ERROR", s.teams.nameTooLong),
    reject(500, undefined, s.teams.createFailed),
  ])("creating a team: %s", async (_name, err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    fireEvent.change(await openCreateForm(), { target: { value: "Design" } });
    fireEvent.click(screen.getByRole("button", { name: de.common.create }));
    await expectShown(expected);
  });

  it("caps the name field at the server's limit", async () => {
    expect(await openCreateForm()).toHaveAttribute("maxLength", "50");
  });

  async function openTeamMenu() {
    renderDe(<TeamsSection />);
    fireEvent.click(await screen.findByRole("button", { name: de.common.actions }));
    return screen.getByRole("menu");
  }

  it.each([
    reject(409, "CONFLICT", s.teams.duplicateName),
    reject(400, "VALIDATION_ERROR", s.teams.nameTooLong),
    reject(500, undefined, s.teams.renameFailed),
  ])("renaming a team: %s", async (_name, err, expected) => {
    apiPut.mockRejectedValueOnce(err);
    const menu = await openTeamMenu();
    fireEvent.click(within(menu).getByText(s.teams.renameAction));
    fireEvent.click(screen.getByRole("button", { name: de.common.save }));
    await expectShown(expected);
  });

  it.each([
    // Both refusals (the Default team, a team with members) are this 400.
    reject(400, "VALIDATION_ERROR", s.teams.cannotDeleteDefault),
    reject(500, undefined, s.teams.deleteFailed),
  ])("deleting a team: %s", async (_name, err, expected) => {
    apiDelete.mockRejectedValueOnce(err);
    const menu = await openTeamMenu();
    fireEvent.click(within(menu).getByText(s.teams.deleteAction));
    await expectShown(expected);
  });

  it("reports a deleted team in the UI language", async () => {
    apiDelete.mockResolvedValueOnce({});
    const menu = await openTeamMenu();
    fireEvent.click(within(menu).getByText(s.teams.deleteAction));
    await expectShown(format(s.teams.deleteSuccess, { name: "Design" }));
  });

  it("500 saving a team's quota falls back to the translated failure", async () => {
    apiPut.mockRejectedValueOnce(apiError(500));
    const menu = await openTeamMenu();
    fireEvent.click(within(menu).getByText(s.heading));
    fireEvent.click(screen.getByRole("button", { name: de.common.save }));
    await expectShown(s.teams.quotaSaveFailed);
  });
});

describe("Roles", () => {
  beforeEach(() => {
    useAuth.mockReturnValue({
      loading: false,
      permissions: ["security:manage"],
      hasPermission: (p: string) => p === "security:manage",
      authEnabled: true,
      role: "admin",
      hasLocalPassword: true,
      totpEnabled: false,
    });
  });

  async function openCreateForm(name: string, permission: string | null = "tools:use") {
    renderDe(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.roles.createButton }));
    fireEvent.change(screen.getByPlaceholderText(s.roles.roleNamePlaceholder), {
      target: { value: name },
    });
    if (permission) fireEvent.click(screen.getByLabelText(permission));
    fireEvent.click(screen.getByRole("button", { name: de.common.create }));
  }

  it.each([
    reject(409, "CONFLICT", s.roles.duplicateRoleError),
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(500, undefined, s.roles.createFailed),
  ])("creating a role: %s", async (_name, err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    await openCreateForm("reviewer");
    await expectShown(expected);
  });

  it("sends the name the server will store: trimmed and lowercased", async () => {
    apiPost.mockResolvedValueOnce({});
    await openCreateForm("  Reviewer ");
    await expectShown(s.roles.createSuccess);
    expect(apiPost).toHaveBeenCalledWith(
      "/v1/roles",
      expect.objectContaining({ name: "reviewer", permissions: ["tools:use"] }),
    );
  });

  it.each([
    ["a space", "Content Editor"],
    ["an accent", "rédacteur"],
    ["one character", "x"],
  ])("explains the role-name rule for %s without asking the server", async (_case, name) => {
    await openCreateForm(name);
    await expectShown(s.roles.nameInvalid);
    expect(apiPost).not.toHaveBeenCalled();
  });

  it("asks for a permission before creating a role with none", async () => {
    await openCreateForm("reviewer", null);
    await expectShown(s.roles.permissionsRequired);
    expect(apiPost).not.toHaveBeenCalled();
  });

  async function openEditForm(name?: string) {
    renderDe(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: de.a11y.editRole }));
    if (name !== undefined) {
      fireEvent.change(screen.getByDisplayValue("auditor"), { target: { value: name } });
    }
    fireEvent.click(screen.getByRole("button", { name: de.common.save }));
  }

  it.each([
    reject(409, "CONFLICT", s.roles.duplicateRoleError),
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(500, undefined, s.roles.updateFailed),
  ])("editing a role: %s", async (_name, err, expected) => {
    apiPut.mockRejectedValueOnce(err);
    await openEditForm();
    await expectShown(expected);
    expect(apiPut).toHaveBeenCalledWith(
      "/v1/roles/r1",
      expect.objectContaining({ name: "auditor" }),
    );
  });

  it("explains the role-name rule when an edit breaks it", async () => {
    await openEditForm("Content Editor");
    await expectShown(s.roles.nameInvalid);
    expect(apiPut).not.toHaveBeenCalled();
  });

  it("asks for a permission before saving an edited role with none (#2887)", async () => {
    renderDe(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: de.a11y.editRole }));
    fireEvent.click(screen.getByLabelText("audit:read"));
    fireEvent.click(screen.getByRole("button", { name: de.common.save }));
    await expectShown(s.roles.permissionsRequired);
    expect(apiPut).not.toHaveBeenCalled();
    expect(screen.getByDisplayValue("auditor")).toBeInTheDocument();
  });

  it("deleting a role asks and reports in the UI language", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    apiDelete.mockResolvedValueOnce({});
    renderDe(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: de.a11y.deleteRole }));

    expect(confirm).toHaveBeenCalledWith(format(s.roles.deleteConfirmSimple, { name: "auditor" }));
    await expectShown(format(s.roles.deleteSuccess, { name: "auditor" }));
  });

  it.each([
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(500, undefined, s.roles.deleteFailed),
  ])("deleting a role: %s", async (_name, err, expected) => {
    apiDelete.mockRejectedValueOnce(err);
    renderDe(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: de.a11y.deleteRole }));
    await expectShown(expected);
  });
});

describe("Two-factor authentication", () => {
  it.each([
    reject(403, "FEATURE_NOT_LICENSED", de.errors.featureNotLicensed),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(409, "MFA_ALREADY_ENABLED", s.security.twoFactorStateChanged),
    reject(500, undefined, s.security.securitySettingsFailed),
  ])("starting enrolment: %s", async (_name, err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    renderDe(<TwoFactorSettings />);
    fireEvent.click(await screen.findByRole("button", { name: s.security.enableTwoFactorButton }));
    await expectShown(expected);
  });

  async function verify(err: ApiError) {
    apiPost
      .mockResolvedValueOnce({ uri: "otpauth://totp/x?secret=ABC", recoveryCodes: ["a"] })
      .mockRejectedValueOnce(err);
    renderDe(<TwoFactorSettings />);
    fireEvent.click(await screen.findByRole("button", { name: s.security.enableTwoFactorButton }));
    fireEvent.change(await screen.findByPlaceholderText(s.security.twoFactorCodePlaceholder), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.security.twoFactorConfirmButton }));
  }

  it.each([
    reject(401, "INVALID_CODE", de.auth.mfaInvalidCode),
    reject(400, "VALIDATION_ERROR", de.auth.mfaInvalidCode),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(429, undefined, de.auth.mfaThrottledUnknownWait),
    reject(409, "MFA_ALREADY_ENABLED", s.security.twoFactorStateChanged),
    reject(400, "NO_PENDING_ENROLLMENT", s.security.twoFactorStateChanged),
    reject(500, "DECRYPTION_FAILED", s.security.twoFactorUnreadable),
    reject(500, undefined, de.errors.generic),
  ])("confirming the code: %s", async (_name, err, expected) => {
    await verify(err);
    await expectShown(expected);
  });

  it.each([
    reject(401, "INVALID_CODE", de.auth.mfaInvalidCode),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(400, "MFA_NOT_ENABLED", s.security.twoFactorStateChanged),
    reject(500, "DECRYPTION_FAILED", s.security.twoFactorUnreadable),
    reject(500, undefined, de.errors.generic),
  ])("turning it off: %s", async (_name, err, expected) => {
    useAuth.mockReturnValue({ ...useAuth(), totpEnabled: true });
    apiPost.mockRejectedValueOnce(err);
    renderDe(<TwoFactorSettings />);
    fireEvent.click(await screen.findByRole("button", { name: s.security.disableTwoFactorButton }));
    fireEvent.change(screen.getByLabelText(s.security.twoFactorEnterCode), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.security.disableTwoFactorButton }));
    await expectShown(expected);
  });
});

describe("General: save preferences (#2713)", () => {
  async function save(err: ApiError) {
    apiPut.mockRejectedValueOnce(err);
    renderDe(<GeneralSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.general.saveButton }));
  }

  it.each([
    reject(401, "AUTH_REQUIRED", de.errors.sessionEnded),
    reject(403, "FORBIDDEN", de.errors.forbidden),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(429, undefined, de.errors.tooManyRequests),
    reject(500, undefined, s.general.saveFailed),
  ])("%s", async (_name, err, expected) => {
    await save(err);
    const msg = await screen.findByText(expected);
    expect(msg).toHaveClass("text-destructive");
    expect(screen.queryByText(SERVER_TEXT)).toBeNull();
  });

  it("shows the success message in success-ink when saving succeeds", async () => {
    apiPut.mockResolvedValueOnce({});
    renderDe(<GeneralSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.general.saveButton }));
    const msg = await screen.findByText(s.general.saveSuccess);
    expect(msg).toHaveClass("text-success-ink");
  });

  it("logs the server's reason when it falls back", async () => {
    const err = apiError(500);
    await save(err);
    await expectShown(s.general.saveFailed);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), err);
  });
});

describe("System: support bundle download (#2713)", () => {
  async function download(status: number, code?: string, contentType = "application/json") {
    const body =
      contentType === "application/json"
        ? JSON.stringify({ error: SERVER_TEXT, ...(code ? { code } : {}) })
        : "<html>Bad Gateway</html>";
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(body, { status, headers: { "content-type": contentType } }),
    );
    renderDe(<SystemSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.system.supportBundleButton }));
  }

  it.each([
    ["401 AUTH_REQUIRED", 401, "AUTH_REQUIRED", de.errors.sessionEnded],
    ["403 FORBIDDEN", 403, "FORBIDDEN", de.errors.forbidden],
    ["403 IP_NOT_ALLOWED", 403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed],
    ["429 (no code)", 429, undefined, de.errors.tooManyRequests],
    ["500 (no code)", 500, undefined, s.system.supportBundleFailed],
  ] as const)("%s", async (_name, status, code, expected) => {
    await download(status, code);
    await expectShown(expected);
  });

  it("falls back and logs the ApiError when the response is not JSON", async () => {
    await download(502, undefined, "text/html");
    await expectShown(s.system.supportBundleFailed);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), expect.any(ApiError));
    expect(useConnectionStore.getState().status).toBe("connected");
  });

  it("marks the connection disconnected when the support-bundle fetch fails with a network TypeError (#3200)", async () => {
    const netErr = new TypeError("Failed to fetch");
    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(netErr);
    renderDe(<SystemSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.system.supportBundleButton }));

    await expectShown(s.system.supportBundleFailed);
    expect(useConnectionStore.getState().status).toBe("disconnected");
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), netErr);
  });
});

describe("API keys (#2713)", () => {
  it.each([
    reject(401, "AUTH_REQUIRED", de.errors.sessionEnded),
    reject(403, "FORBIDDEN", de.errors.forbidden),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(429, undefined, de.errors.tooManyRequests),
    reject(500, undefined, de.common.somethingWentWrong),
  ])("generating a key: %s", async (_name, err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    renderDe(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.apiKeys.generateButton }));
    await expectShown(expected);
  });

  it("maps 400 VALIDATION_ERROR to expiresInPast when an expiration date was submitted, and falls back when none was set (#3214)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date("2026-07-15T12:30:45.000Z"));
      renderDe(<ApiKeysSection />);
      const generateBtn = await screen.findByRole("button", { name: s.apiKeys.generateButton });

      // Without expiresAt, a server 400 VALIDATION_ERROR is not an expiry error.
      const nonExpiryErr = apiError(400, "VALIDATION_ERROR");
      apiPost.mockRejectedValueOnce(nonExpiryErr);
      fireEvent.click(generateBtn);
      await expectShown(de.common.somethingWentWrong);
      expect(console.warn).toHaveBeenCalledWith(expect.any(String), nonExpiryErr);

      // With a future expiresAt that the server rejects for clock skew, show expiresInPast.
      const expiresInput = screen.getByLabelText(s.apiKeys.expiresLabel);
      const minVal = expiresInput.getAttribute("min") ?? "";
      fireEvent.change(expiresInput, { target: { value: minVal } });
      apiPost.mockRejectedValueOnce(apiError(400, "VALIDATION_ERROR"));
      fireEvent.click(generateBtn);
      await expectShown(s.apiKeys.expiresInPast);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    reject(401, "AUTH_REQUIRED", de.errors.sessionEnded),
    reject(403, "FORBIDDEN", de.errors.forbidden),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(429, undefined, de.errors.tooManyRequests),
    reject(500, undefined, de.common.somethingWentWrong),
  ])("deleting a key: %s", async (_name, err, expected) => {
    apiDelete.mockRejectedValueOnce(err);
    renderDe(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole("button", { name: de.a11y.deleteKey }));
    await expectShown(expected);
  });

  it("logs the server's reason when generating or deleting falls back", async () => {
    const genErr = apiError(500);
    const delErr = apiError(500);
    apiPost.mockRejectedValueOnce(genErr);
    apiDelete.mockRejectedValueOnce(delErr);
    renderDe(<ApiKeysSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.apiKeys.generateButton }));
    await expectShown(de.common.somethingWentWrong);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), genErr);

    fireEvent.click(screen.getByRole("button", { name: de.a11y.deleteKey }));
    await expectShown(de.common.somethingWentWrong);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), delErr);
  });

  it("caps the key-name field at the server's 100-character limit (#3201)", async () => {
    renderDe(<ApiKeysSection />);
    const input = await screen.findByPlaceholderText(s.apiKeys.keyNamePlaceholder);
    expect(input).toHaveAttribute("maxLength", "100");
  });

  it.each([
    ["ahead of UTC (UTC+4)", "2026-07-15T22:30:45.000Z", -240, "2026-07-16T02:31"],
    ["behind UTC (UTC-5)", "2026-07-15T02:30:45.000Z", 300, "2026-07-14T21:31"],
  ])(
    "formats the expiration datetime-local min as the next local minute when %s (#3201, #3214)",
    async (_label, isoNow, tzOffsetMinutes, expectedMin) => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        vi.setSystemTime(new Date(isoNow));
        vi.spyOn(Date.prototype, "getTimezoneOffset").mockReturnValue(tzOffsetMinutes);
        renderDe(<ApiKeysSection />);
        const expiresInput = await screen.findByLabelText(s.apiKeys.expiresLabel);
        expect(expiresInput).toHaveAttribute("min", expectedMin);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it("rejects a past or current-minute expiration date before calling the server, and recovers on retry (#3214)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date("2026-07-15T12:30:45.000Z"));
      renderDe(<ApiKeysSection />);
      const expiresInput = await screen.findByLabelText(s.apiKeys.expiresLabel);
      const generateBtn = screen.getByRole("button", { name: s.apiKeys.generateButton });

      // Current local minute (truncates seconds to :30:00.000, 45s in the past).
      const currentLocalMinute = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
        .toISOString()
        .slice(0, 16);
      fireEvent.change(expiresInput, { target: { value: currentLocalMinute } });
      fireEvent.click(generateBtn);
      await expectShown(s.apiKeys.expiresInPast);
      expect(apiPost).not.toHaveBeenCalled();
      expect(generateBtn).not.toBeDisabled();

      // Explicitly typed past date.
      fireEvent.change(expiresInput, { target: { value: "2020-01-01T00:00" } });
      fireEvent.click(generateBtn);
      await expectShown(s.apiKeys.expiresInPast);
      expect(apiPost).not.toHaveBeenCalled();

      // Clearing the expiration date and retrying succeeds and clears the error banner.
      apiPost.mockResolvedValueOnce({ key: "si_recovered" });
      fireEvent.click(screen.getByRole("button", { name: s.apiKeys.clearButton }));
      fireEvent.click(generateBtn);
      await expectShown("si_recovered");
      expect(screen.queryByText(s.apiKeys.expiresInPast)).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an expiration minute that reached or passed Date.now() while the dialog stayed open (#3214)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      vi.setSystemTime(new Date("2026-07-15T12:30:45.000Z"));
      renderDe(<ApiKeysSection />);
      const expiresInput = await screen.findByLabelText(s.apiKeys.expiresLabel);
      const minVal = expiresInput.getAttribute("min") ?? "";
      fireEvent.change(expiresInput, { target: { value: minVal } });

      // Advance to the exact start of the selected minute (parsedExpiry.getTime() === Date.now()).
      vi.setSystemTime(new Date("2026-07-15T12:31:00.000Z"));
      fireEvent.click(screen.getByRole("button", { name: s.apiKeys.generateButton }));

      await expectShown(s.apiKeys.expiresInPast);
      expect(apiPost).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects an unparseable expiration date without throwing or calling the server (#3214)", async () => {
    renderDe(<ApiKeysSection />);
    const expiresInput = (await screen.findByLabelText(s.apiKeys.expiresLabel)) as HTMLInputElement;
    // Bypass jsdom's datetime-local value sanitization to reach the NaN guard in generateKey.
    expiresInput.type = "text";
    fireEvent.change(expiresInput, { target: { value: "not-a-date" } });
    fireEvent.click(screen.getByRole("button", { name: s.apiKeys.generateButton }));

    await expectShown(s.apiKeys.expiresInPast);
    expect(apiPost).not.toHaveBeenCalled();
    expect(console.warn).not.toHaveBeenCalled();
  });

  it("selecting the earliest allowed min minute submits a timestamp strictly in the future (#3214)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const now = new Date("2026-07-15T12:30:45.000Z");
      vi.setSystemTime(now);
      apiPost.mockResolvedValueOnce({ key: "si_future" });
      renderDe(<ApiKeysSection />);
      const expiresInput = await screen.findByLabelText(s.apiKeys.expiresLabel);
      const minVal = expiresInput.getAttribute("min") ?? "";
      fireEvent.change(expiresInput, { target: { value: minVal } });
      fireEvent.click(screen.getByRole("button", { name: s.apiKeys.generateButton }));

      await expectShown("si_future");
      expect(apiPost).toHaveBeenCalledTimes(1);
      const sentExpiresAt = (apiPost.mock.calls[0][1] as { expiresAt: string }).expiresAt;
      expect(new Date(sentExpiresAt).getTime()).toBeGreaterThan(now.getTime());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("Tools: save disabled tools (#2713)", () => {
  async function save(err: ApiError) {
    apiPut.mockRejectedValueOnce(err);
    renderDe(<ToolsSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.tools.saveButton }));
  }

  it.each([
    reject(401, "AUTH_REQUIRED", de.errors.sessionEnded),
    reject(403, "FORBIDDEN", de.errors.forbidden),
    reject(403, "IP_NOT_ALLOWED", de.auth.ipNotAllowed),
    reject(429, undefined, de.errors.tooManyRequests),
    reject(500, undefined, de.common.somethingWentWrong),
  ])("%s", async (_name, err, expected) => {
    await save(err);
    await expectShown(expected);
  });

  it("clears the error banner and shows the restart banner when the next save succeeds", async () => {
    apiPut.mockRejectedValueOnce(apiError(401, "AUTH_REQUIRED")).mockResolvedValueOnce({});
    renderDe(<ToolsSection />);
    const button = await screen.findByRole("button", { name: s.tools.saveButton });
    fireEvent.click(button);
    await expectShown(de.errors.sessionEnded);

    fireEvent.click(button);
    await expectShown(s.tools.restartBanner);
    expect(screen.queryByText(de.errors.sessionEnded)).toBeNull();
  });

  it("clears the restart banner when a subsequent save fails (#3200)", async () => {
    apiPut.mockResolvedValueOnce({}).mockRejectedValueOnce(apiError(500));
    renderDe(<ToolsSection />);
    const button = await screen.findByRole("button", { name: s.tools.saveButton });
    fireEvent.click(button);
    await expectShown(s.tools.restartBanner);

    fireEvent.click(button);
    await expectShown(de.common.somethingWentWrong);
    expect(screen.queryByText(s.tools.restartBanner)).toBeNull();
  });

  it("logs the server's reason when saving tools falls back", async () => {
    const err = apiError(500);
    await save(err);
    await expectShown(de.common.somethingWentWrong);
    expect(console.warn).toHaveBeenCalledWith(expect.any(String), err);
  });

  it.each(["{corrupt", "{}", "null", "[42]"])(
    "ToolsSection falls back disabledTools to [] when /v1/settings returns %s (#3084)",
    async (rawDisabledTools) => {
      apiGet.mockResolvedValueOnce({
        settings: { disabledTools: rawDisabledTools },
      });
      renderDe(<ToolsSection />);
      expect(await screen.findByRole("button", { name: s.tools.saveButton })).toBeEnabled();
      expect(
        screen.getByText(format(s.tools.disabledCountOther, { count: 0 })),
      ).toBeInTheDocument();
      expect(screen.queryByText(s.tools.loadFailedError)).toBeNull();
    },
  );

  it.each(["{corrupt", "{}", "null", "[42]"])(
    "ToolPalette falls back disabledTools to [] when /v1/settings returns %s (#3084)",
    async (rawDisabledTools) => {
      // Marking resize experimental ensures it only renders once /v1/settings
      // resolves and setExperimentalEnabled(true) runs after setDisabledTools.
      const { TOOLS } = await import("@snapotter/shared");
      const resizeTool = TOOLS.find((t) => t.id === "resize");
      const prevExperimental = resizeTool?.experimental;
      if (resizeTool) resizeTool.experimental = true;

      try {
        apiGet.mockImplementation(async (url: string) => {
          if (url === "/v1/settings") {
            return {
              settings: {
                disabledTools: rawDisabledTools,
                enableExperimentalTools: "true",
              },
            };
          }
          if (url === "/v1/pipeline/tools") {
            return { toolIds: ["resize"] };
          }
          return {};
        });
        renderDe(<ToolPalette onAddStep={() => {}} />);
        await act(async () => {});
        expect(await screen.findByText(de.tools.resize.name)).toBeInTheDocument();
      } finally {
        if (resizeTool) resizeTool.experimental = prevExperimental;
      }
    },
  );

  it("ToolPalette hides tools listed in a valid disabledTools JSON array (#3084)", async () => {
    apiGet.mockImplementation(async (url: string) => {
      if (url === "/v1/settings") {
        return {
          settings: {
            disabledTools: JSON.stringify(["resize"]),
            enableExperimentalTools: "false",
          },
        };
      }
      if (url === "/v1/pipeline/tools") {
        return { toolIds: ["resize", "crop"] };
      }
      return {};
    });
    renderDe(<ToolPalette onAddStep={() => {}} />);
    await act(async () => {});
    expect(await screen.findByText(de.tools.crop.name)).toBeInTheDocument();
    expect(screen.queryByText(de.tools.resize.name)).toBeNull();
  });
});
