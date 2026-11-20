// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";

const apiPut = vi.hoisted(() => vi.fn().mockResolvedValue({}));
const useAuth = vi.hoisted(() => vi.fn());
const fetchConfig = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const store = vi.hoisted(() => ({
  config: { enabled: false, consentPending: true } as {
    enabled: boolean;
    consentPending?: boolean;
  },
  configLoaded: true,
}));

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiPut };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth }));

vi.mock("@/stores/analytics-store", () => {
  const useAnalyticsStore = (selector: (state: typeof store) => unknown) => selector(store);
  useAnalyticsStore.getState = () => ({ ...store, fetchConfig });
  return { useAnalyticsStore };
});

import {
  AnalyticsConsentPrompt,
  CONSENT_DISMISSED_SESSION_KEY,
} from "@/components/onboarding/analytics-consent-prompt";

const TITLE = "Send anonymous usage stats and crash reports?";

afterEach(() => {
  cleanup();
  store.config = { enabled: false, consentPending: true };
  store.configLoaded = true;
  apiPut.mockReset();
  apiPut.mockResolvedValue({});
  fetchConfig.mockClear();
  useAuth.mockReset();
  sessionStorage.clear();
});

function renderPrompt(initialPath = "/") {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AnalyticsConsentPrompt />
    </MemoryRouter>,
  );
}

describe("AnalyticsConsentPrompt (#4910)", () => {
  it("asks an admin on a fresh install, with both answers equally weighted and none pre-selected", () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    renderPrompt();

    expect(screen.getByRole("dialog")).toHaveTextContent(TITLE);
    expect(screen.getByText(/Your files are never sent/)).toBeInTheDocument();
    const yes = screen.getByRole("button", { name: "Send" });
    const no = screen.getByRole("button", { name: "Don't send" });
    expect(yes.className).toBe(no.className);
    expect(document.activeElement).not.toBe(yes);
    expect(document.activeElement).not.toBe(no);
  });

  it("asks the local user when auth is off, since useAuth reports them as admin", () => {
    // use-auth.ts answers role "admin" for AUTH_ENABLED=false.
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false, authEnabled: false });
    renderPrompt();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not ask a non-admin, who cannot change the instance setting", () => {
    useAuth.mockReturnValue({ role: "user", mustChangePassword: false });
    renderPrompt();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show over the forced password change", () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: true });
    renderPrompt();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show on an ungated route such as /change-password", () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    renderPrompt("/change-password");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not show once the instance has decided, or before the config loads", () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    store.config = { enabled: true, consentPending: false };
    renderPrompt();
    expect(screen.queryByRole("dialog")).toBeNull();
    cleanup();
    store.config = { enabled: false, consentPending: true };
    store.configLoaded = false;
    renderPrompt();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it.each([
    ["Send", "true"],
    ["Don't send", "false"],
  ])("%s saves analyticsEnabled=%s and refreshes the config", async (label, value) => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: label }));
    await waitFor(() => expect(fetchConfig).toHaveBeenCalledTimes(1));
    expect(apiPut).toHaveBeenCalledWith("/v1/settings", { analyticsEnabled: value });
    // Closes on the saved answer even though this refetch left the config pending.
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows an error and stays open when saving fails", async () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    apiPut.mockRejectedValue(new Error("offline"));
    renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't save your choice");
    expect(fetchConfig).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("closing without answering saves nothing and hides it for this tab only", () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    renderPrompt();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiPut).not.toHaveBeenCalled();
    expect(sessionStorage.getItem(CONSENT_DISMISSED_SESSION_KEY)).toBe("1");
  });

  it("Escape closes it the same way", () => {
    useAuth.mockReturnValue({ role: "admin", mustChangePassword: false });
    renderPrompt();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(apiPut).not.toHaveBeenCalled();
  });
});
