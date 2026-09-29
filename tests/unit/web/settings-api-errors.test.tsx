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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
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
  PeopleSection,
  RolesSection,
  SecuritySection,
  TeamsSection,
} from "@/components/settings/settings-dialog";
import { TwoFactorSettings } from "@/components/settings/two-factor-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { ApiError } from "@/lib/api";
import { format } from "@/lib/format";

const s = de.settings;
const SERVER_TEXT = "SERVER-TEXT";

/** A rejection as api.ts throws it. */
function apiError(status: number, code?: string, extra: Record<string, unknown> = {}) {
  return new ApiError(SERVER_TEXT, status, code, { error: SERVER_TEXT, code, ...extra });
}

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

beforeEach(() => {
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
    if (path.startsWith("/auth/users")) return { users: [user], maxUsers: 5 };
    if (path.startsWith("/v1/teams")) return { teams: [team] };
    if (path.startsWith("/v1/roles")) return { roles: [role] };
    if (path.startsWith("/v1/settings")) return { settings: {} };
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
    reject(403, "ESCALATION_DENIED", de.errors.escalationDenied),
    reject(401, "AUTH_REQUIRED", de.errors.sessionEnded),
    reject(403, "FORBIDDEN", de.errors.forbidden),
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
