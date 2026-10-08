// @vitest-environment jsdom

/**
 * Behaviour of the forced change-password page that isn't about the language
 * of its errors (#1569): a successful change is never reported as a failure,
 * the inputs don't hard-code a minimum length, and every broken rule is
 * listed at once.
 */

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as change-password-errors.test.tsx).
const storage = vi.hoisted(() => new Map<string, string>());
const storageFails = vi.hoisted(() => ({ set: false }));
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => {
    if (storageFails.set && k === "snapotter-welcome") throw new Error("QuotaExceededError");
    storage.set(k, v);
  },
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { I18nProvider } from "@/contexts/i18n-context";
import { ChangePasswordPage } from "@/pages/change-password-page";

const fetchMock = vi.fn();
const submitSpy = vi.fn();

beforeEach(() => {
  storage.clear();
  storageFails.set = false;
  storage.set("snapotter-locale", "en");
  vi.stubGlobal("fetch", fetchMock);
  // jsdom doesn't implement form submission; the page's post-success navigation is one.
  vi.spyOn(HTMLFormElement.prototype, "submit").mockImplementation(submitSpy);
});

afterEach(() => {
  cleanup();
  fetchMock.mockReset();
  submitSpy.mockReset();
  vi.restoreAllMocks();
});

function answer(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify(body), {
      status,
      headers: { "content-type": "application/json" },
    }),
  );
}

async function fillAndSubmit(newPassword = "new-Password1") {
  render(
    <I18nProvider>
      <ChangePasswordPage />
    </I18nProvider>,
  );
  fireEvent.change(await screen.findByLabelText(en.changePassword.currentPasswordLabel), {
    target: { value: "old-Password1" },
  });
  fireEvent.change(screen.getByLabelText(en.changePassword.newPasswordLabel), {
    target: { value: newPassword },
  });
  fireEvent.change(screen.getByLabelText(en.changePassword.confirmPasswordLabel), {
    target: { value: newPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: en.changePassword.changeButton }));
}

describe("a successful change is never reported as a failure", () => {
  it("still goes on to the save-password navigation when storage is blocked", async () => {
    storageFails.set = true;
    answer(200, {});

    await fillAndSubmit();

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(en.changePassword.failedError)).toBeNull();
  });

  it("offers the browser the stored username even when the welcome flag cannot be written", async () => {
    storageFails.set = true;
    storage.set("snapotter-username", "alice");
    let offered = "";
    submitSpy.mockImplementation(function (this: HTMLFormElement) {
      offered = this.querySelector<HTMLInputElement>("input[name=username]")?.value ?? "";
    });
    answer(200, {});

    await fillAndSubmit();

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    expect(offered).toBe("alice");
  });

  it("keeps the button disabled once the change succeeded, so a second click cannot resend", async () => {
    answer(200, {});

    await fillAndSubmit();

    await waitFor(() => expect(submitSpy).toHaveBeenCalledTimes(1));
    expect(screen.getByRole("button", { name: en.changePassword.changingButton })).toBeDisabled();
  });

  it("falls back to a plain navigation when the save-password form cannot be submitted", async () => {
    answer(200, {});
    submitSpy.mockImplementation(() => {
      throw new Error("blocked");
    });
    const assign = vi.fn();
    vi.stubGlobal("location", { ...window.location, assign });

    await fillAndSubmit();

    await waitFor(() => expect(assign).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(en.changePassword.failedError)).toBeNull();
  });
});

describe("the password inputs", () => {
  it("leave the minimum length to the server's policy", async () => {
    render(
      <I18nProvider>
        <ChangePasswordPage />
      </I18nProvider>,
    );
    const newPassword = await screen.findByLabelText(en.changePassword.newPasswordLabel);

    expect(newPassword).not.toHaveAttribute("minlength");
    expect(screen.getByLabelText(en.changePassword.confirmPasswordLabel)).not.toHaveAttribute(
      "minlength",
    );
  });
});

describe("every broken rule is listed at once", () => {
  it("shows one line per rule the server names", async () => {
    answer(400, {
      code: "VALIDATION_ERROR",
      rule: "minLength",
      rules: ["minLength", "uppercase", "special"],
      minLength: 12,
    });

    await fillAndSubmit("short");

    const alert = await screen.findByRole("alert");
    // The list sits inside the alert region, not on it, so the items keep list semantics.
    expect(alert.tagName).not.toBe("UL");
    const lines = Array.from(alert.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual([
      "Password must be at least 12 characters.",
      en.errors.passwordNeedsUppercase,
      en.errors.passwordNeedsSpecial,
    ]);
  });

  it("shows a single rule as a plain message, as before", async () => {
    answer(400, { code: "VALIDATION_ERROR", rule: "digit", rules: ["digit"] });

    await fillAndSubmit("NoDigitsHere");

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(en.errors.passwordNeedsDigit);
    expect(alert.querySelector("li")).toBeNull();
  });

  it("still words a response that only carries `rule`", async () => {
    answer(400, { code: "VALIDATION_ERROR", rule: "lowercase" });

    await fillAndSubmit("ALLUPPER1");

    expect(await screen.findByText(en.errors.passwordNeedsLowercase)).toBeVisible();
  });
});
