// @vitest-environment jsdom

/**
 * Settings screens word a failed request in the UI language, chosen by the
 * API's status and code, never its English `error` text (#1445). Every
 * rejection here carries the sentinel "SERVER-TEXT" as its message: the
 * screen must show the translated copy and never the sentinel.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { ApiError } from "@/lib/api";
import { format } from "@/lib/format";

const s = en.settings;
const SERVER_TEXT = "SERVER-TEXT";

function apiError(status: number, code?: string, extra: Record<string, unknown> = {}) {
  return new ApiError(SERVER_TEXT, status, code, { error: SERVER_TEXT, code, ...extra });
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  for (const mock of [apiGet, apiPost, apiPut, apiDelete, useAuth]) mock.mockReset();
});

describe("Security: change password", () => {
  function submit(newPassword = "NewPassword1") {
    render(<SecuritySection />);
    fireEvent.change(screen.getByPlaceholderText(s.security.currentPasswordPlaceholder), {
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

  it("says the current password is wrong", async () => {
    apiPost.mockRejectedValueOnce(apiError(401, "INVALID_PASSWORD"));
    submit();
    await expectShown(s.security.currentPasswordIncorrect);
  });

  it("lets the server's policy answer for a short password, with its own minimum", async () => {
    // No client-side "at least 8" guess: the policy may say 12.
    apiPost.mockRejectedValueOnce(
      apiError(400, "VALIDATION_ERROR", { rule: "minLength", minLength: 12 }),
    );
    submit("ab");
    await expectShown(format(en.errors.passwordTooShort, { minLength: 12 }));
    expect(apiPost).toHaveBeenCalledWith("/auth/change-password", expect.anything());
  });

  it("falls back to the translated failure", async () => {
    apiPost.mockRejectedValueOnce(apiError(500));
    submit();
    await expectShown(s.security.changeFailed);
  });
});

describe("Admin security settings: save", () => {
  it("names the missing licence", async () => {
    apiPut.mockRejectedValueOnce(apiError(403, "FEATURE_NOT_LICENSED"));
    render(<AdminSecuritySettings />);
    fireEvent.click(await screen.findByRole("button", { name: /save/i }));
    await expectShown(en.errors.featureNotLicensed);
  });
});

describe("People", () => {
  async function openAddForm() {
    render(<PeopleSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.people.addMembersButton }));
    fireEvent.change(screen.getByPlaceholderText(s.people.usernamePlaceholder), {
      target: { value: "grace" },
    });
    fireEvent.change(screen.getByPlaceholderText(s.people.passwordPlaceholder), {
      target: { value: "ValidPass1" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.people.createButton }));
  }

  it.each([
    [apiError(409, "CONFLICT"), s.people.usernameTaken],
    [apiError(403, "USER_LIMIT_REACHED"), format(s.people.userLimitReached, { max: 5 })],
    [apiError(403, "ESCALATION_DENIED"), en.errors.escalationDenied],
    [apiError(400, "VALIDATION_ERROR", { rule: "uppercase" }), en.errors.passwordNeedsUppercase],
    [apiError(500), s.people.createFailed],
  ])("adding a user: %s", async (err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    await openAddForm();
    await expectShown(expected);
  });

  async function openUserMenu(action: string) {
    render(<PeopleSection />);
    fireEvent.click(await screen.findByRole("button", { name: en.common.actions }));
    fireEvent.click(screen.getByText(action));
  }

  it.each([
    [apiError(400, "SELF_DEMOTE"), s.people.cannotRemoveOwnAdmin],
    [apiError(400, "LAST_ADMIN"), s.people.lastAdmin],
    [apiError(403, "ESCALATION_DENIED"), en.errors.escalationDenied],
    [apiError(500), s.people.updateFailed],
  ])("editing a user's role or team: %s", async (err, expected) => {
    apiPut.mockRejectedValueOnce(err);
    await openUserMenu(s.people.editRoleTeamAction);
    fireEvent.click(screen.getByRole("button", { name: en.common.save }));
    await expectShown(expected);
  });

  it.each([
    [apiError(400, "VALIDATION_ERROR", { rule: "digit" }), en.errors.passwordNeedsDigit],
    [apiError(400, "OIDC_NO_PASSWORD"), en.auth.passwordManagedByProvider],
    [apiError(500), s.people.resetFailed],
  ])("resetting a password: %s", async (err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    await openUserMenu(s.people.resetPasswordAction);
    fireEvent.change(screen.getByPlaceholderText(s.people.newPasswordLabel), {
      target: { value: "NoDigitsHere" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.people.resetPasswordButton }));
    await expectShown(expected);
  });

  it.each([
    [apiError(400, "SELF_DELETE"), s.people.cannotDeleteSelf],
    [apiError(403, "ESCALATION_DENIED"), en.errors.escalationDenied],
    [apiError(500), s.people.deleteFailed],
  ])("deleting a user: %s", async (err, expected) => {
    apiDelete.mockRejectedValueOnce(err);
    await openUserMenu(s.people.deleteUserAction);
    await expectShown(expected);
  });
});

describe("Teams", () => {
  it.each([
    [apiError(409, "CONFLICT"), s.teams.duplicateName],
    [apiError(500), s.teams.createFailed],
  ])("creating a team: %s", async (err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    render(<TeamsSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.teams.createButton }));
    fireEvent.change(screen.getByPlaceholderText(s.teams.teamNamePlaceholder), {
      target: { value: "Design" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.teams.createSubmitButton }));
    await expectShown(expected);
  });

  async function openTeamMenu() {
    render(<TeamsSection />);
    fireEvent.click(await screen.findByRole("button", { name: en.common.actions }));
    return screen.getByRole("menu");
  }

  it("renaming a team to a taken name", async () => {
    apiPut.mockRejectedValueOnce(apiError(409, "CONFLICT"));
    const menu = await openTeamMenu();
    fireEvent.click(within(menu).getByText(s.teams.renameAction));
    fireEvent.click(screen.getByRole("button", { name: s.teams.renameSaveButton }));
    await expectShown(s.teams.duplicateName);
  });

  it("deleting a team the server refuses (Default, or has members)", async () => {
    apiDelete.mockRejectedValueOnce(apiError(400, "VALIDATION_ERROR"));
    const menu = await openTeamMenu();
    fireEvent.click(within(menu).getByText(s.teams.deleteAction));
    await expectShown(s.teams.cannotDeleteDefault);
  });

  it("saving a team's quota", async () => {
    apiPut.mockRejectedValueOnce(apiError(500));
    const menu = await openTeamMenu();
    fireEvent.click(within(menu).getByText(s.heading));
    fireEvent.click(screen.getByRole("button", { name: en.common.save }));
    await expectShown(s.teams.quotaSaveFailed);
  });
});

describe("Roles", () => {
  it.each([
    [apiError(409, "CONFLICT"), s.roles.duplicateRoleError],
    [apiError(403, "ESCALATION_DENIED"), en.errors.escalationDenied],
    [apiError(500), s.roles.createFailed],
  ])("creating a role: %s", async (err, expected) => {
    apiPost.mockRejectedValueOnce(err);
    render(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: s.roles.createButton }));
    fireEvent.change(screen.getByPlaceholderText(s.roles.roleNamePlaceholder), {
      target: { value: "auditor" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.roles.createSubmitButton }));
    await expectShown(expected);
  });

  it("deleting a role asks and reports in the UI language", async () => {
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    apiDelete.mockResolvedValueOnce({});
    render(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: en.a11y.deleteRole }));

    expect(confirm).toHaveBeenCalledWith(format(s.roles.deleteConfirmSimple, { name: "auditor" }));
    expect(
      await screen.findByText(format(s.roles.deleteSuccess, { name: "auditor" })),
    ).toBeVisible();
  });

  it("deleting a role the server refuses", async () => {
    apiDelete.mockRejectedValueOnce(apiError(403, "ESCALATION_DENIED"));
    render(<RolesSection />);
    fireEvent.click(await screen.findByRole("button", { name: en.a11y.deleteRole }));
    await expectShown(en.errors.escalationDenied);
  });
});

describe("Two-factor authentication", () => {
  it("names the missing licence when enrolment isn't allowed", async () => {
    apiPost.mockRejectedValueOnce(apiError(403, "FEATURE_NOT_LICENSED"));
    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: s.security.enableTwoFactorButton }));
    await expectShown(en.errors.featureNotLicensed);
  });

  async function verify(err: ApiError) {
    apiPost
      .mockResolvedValueOnce({ uri: "otpauth://totp/x?secret=ABC", recoveryCodes: ["a"] })
      .mockRejectedValueOnce(err);
    render(<TwoFactorSettings />);
    fireEvent.click(screen.getByRole("button", { name: s.security.enableTwoFactorButton }));
    fireEvent.change(await screen.findByPlaceholderText(s.security.twoFactorCodePlaceholder), {
      target: { value: "123456" },
    });
    fireEvent.click(screen.getByRole("button", { name: s.security.twoFactorConfirmButton }));
  }

  it.each([
    [apiError(400, "INVALID_CODE"), en.auth.mfaInvalidCode],
    [apiError(429), en.auth.mfaThrottledUnknownWait],
    [apiError(409, "MFA_ALREADY_ENABLED"), s.security.twoFactorStateChanged],
    [apiError(500, "DECRYPTION_FAILED"), s.security.twoFactorUnreadable],
    [apiError(500), en.errors.generic],
  ])("confirming the code: %s", async (err, expected) => {
    await verify(err);
    await expectShown(expected);
  });
});
