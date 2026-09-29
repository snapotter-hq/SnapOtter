// @vitest-environment jsdom

/**
 * The forced change-password page shows its errors in the UI language, not
 * the server's English (#1446). It decides by status and code; the server's
 * `error` text never reaches the screen.
 */

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as bundle-size-copy.test.tsx).
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { I18nProvider } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { ChangePasswordPage } from "@/pages/change-password-page";

const fetchMock = vi.fn();

beforeEach(() => {
  storage.clear();
  storage.set("snapotter-locale", "de");
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
});

function answer(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function submit() {
  render(
    <I18nProvider>
      <ChangePasswordPage />
    </I18nProvider>,
  );
  // The provider loads the German catalog asynchronously.
  fireEvent.change(await screen.findByLabelText(de.changePassword.currentPasswordLabel), {
    target: { value: "old-Password1" },
  });
  fireEvent.change(screen.getByLabelText(de.changePassword.newPasswordLabel), {
    target: { value: "new-Password1" },
  });
  fireEvent.change(screen.getByLabelText(de.changePassword.confirmPasswordLabel), {
    target: { value: "new-Password1" },
  });
  fireEvent.click(screen.getByRole("button", { name: de.changePassword.changeButton }));
}

describe("change-password errors are translated (#1446)", () => {
  it("says the current password is wrong", async () => {
    answer(401, { error: "Current password is incorrect", code: "INVALID_PASSWORD" });

    await submit();

    expect(await screen.findByText(de.settings.security.currentPasswordIncorrect)).toBeVisible();
    expect(screen.queryByText("Current password is incorrect")).toBeNull();
  });

  it("says an SSO account's password is managed by the identity provider", async () => {
    answer(400, {
      error: "Password changes are managed by your identity provider.",
      code: "OIDC_NO_PASSWORD",
    });

    await submit();

    expect(await screen.findByText(de.auth.passwordManagedByProvider)).toBeVisible();
  });

  it("names the minimum length the server enforces", async () => {
    answer(400, {
      error: "Password must be at least 12 characters",
      code: "VALIDATION_ERROR",
      rule: "minLength",
      minLength: 12,
    });

    await submit();

    expect(
      await screen.findByText(format(de.errors.passwordTooShort, { minLength: 12 })),
    ).toBeVisible();
  });

  it.each([
    ["uppercase", de.errors.passwordNeedsUppercase],
    ["lowercase", de.errors.passwordNeedsLowercase],
    ["digit", de.errors.passwordNeedsDigit],
    ["special", de.errors.passwordNeedsSpecial],
  ])("explains a missing %s character", async (rule, expected) => {
    answer(400, { error: "Password must contain something", code: "VALIDATION_ERROR", rule });

    await submit();

    expect(await screen.findByText(expected)).toBeVisible();
    expect(screen.queryByText("Password must contain something")).toBeNull();
  });

  it("asks the user to wait when rate limited", async () => {
    answer(429, { error: "Rate limit exceeded, retry in 1 minute" });

    await submit();

    expect(await screen.findByText(de.errors.tooManyRequests)).toBeVisible();
  });

  it("falls back to the translated generic message, never the server's text", async () => {
    answer(500, { error: "Internal server error" });

    await submit();

    expect(await screen.findByText(de.changePassword.failedError)).toBeVisible();
    expect(screen.queryByText("Internal server error")).toBeNull();
  });

  it("uses the generic message when the request never reaches the server", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));

    await submit();

    expect(await screen.findByText(de.changePassword.failedError)).toBeVisible();
  });
});
