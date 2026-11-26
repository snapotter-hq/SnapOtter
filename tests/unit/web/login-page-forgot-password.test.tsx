// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { LoginPage } from "@/pages/login-page";

// A forgotten password had no way back from the login page, though an admin
// can reset it in Settings and the sole admin can run snapotter-admin.
beforeEach(() => {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => void store.delete(key),
    setItem: (key: string, value: string) => void store.set(key, value),
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(() => new Promise(() => {})),
  );
  useAuth.mockReturnValue({
    oidcEnabled: false,
    oidcProviderName: null,
    samlEnabled: false,
    samlProviderName: null,
    ssoEnforced: false,
  });
});

afterEach(() => {
  cleanup();
  useAuth.mockReset();
  vi.unstubAllGlobals();
});

describe("Forgot password on the login page", () => {
  it("shows how to get the password reset, with the typed username in the command", () => {
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <LoginPage />
      </MemoryRouter>,
    );
    const toggle = screen.getByRole("button", { name: en.auth.forgotPassword });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(en.auth.forgotPasswordHelp)).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(en.auth.username), { target: { value: "grace" } });
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(en.auth.forgotPasswordHelp)).toBeVisible();
    expect(
      screen.getByText("docker exec -it snapotter snapotter-admin reset-password grace"),
    ).toBeVisible();
    expect(screen.getByRole("link", { name: en.auth.forgotPasswordGuide })).toHaveAttribute(
      "href",
      "https://docs.snapotter.com/guide/account-recovery#reset-a-forgotten-password",
    );
  });
});
