// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The layout's nav, dialogs and connection banner are unrelated to the search
// box and reach for the network on mount.
vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { HomePage } from "@/pages/home-page";
import { usePinnedToolsStore } from "@/stores/pinned-tools-store";
import { useSettingsStore } from "@/stores/settings-store";

const QUERY = "xyznonexistent";

function searchBox() {
  return document.querySelector<HTMLInputElement>("[data-search-input]");
}

// This jsdom setup has no working localStorage; same Map-backed stub as
// automate-page-file-reset.test.tsx.
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  useSettingsStore.setState({ loaded: false, loadError: false, fetch: async () => {} });
  usePinnedToolsStore.setState({ fetch: async () => {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// #1875: in macOS WebKit a query typed while the home page still read
// "Search 0 tools..." was sometimes lost. These pin that the page itself keeps
// the query across the settings load, so the e2e loss is the browser race the
// loggedInPage fixture now waits out, not app state being thrown away.
describe("home search typed before settings load", () => {
  it("keeps a query typed while the tool count is still 0", () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HomePage />
      </MemoryRouter>,
    );
    const input = searchBox();
    expect(input).not.toBeNull();
    expect(input?.placeholder).toMatch(/\b0\b/);

    fireEvent.change(input as HTMLInputElement, { target: { value: QUERY } });
    act(() => {
      useSettingsStore.setState({ loaded: true });
    });

    expect(searchBox()).toBe(input);
    expect(searchBox()?.value).toBe(QUERY);
    expect(searchBox()?.placeholder).toMatch(/[1-9]/);
    expect(screen.getByText(/no tools match/i)).toBeInTheDocument();
  });

  it("keeps the query when a reconnect drops settings back to unloaded and reloads them", () => {
    useSettingsStore.setState({ loaded: true });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HomePage />
      </MemoryRouter>,
    );
    const input = searchBox() as HTMLInputElement;
    fireEvent.change(input, { target: { value: QUERY } });

    // connection-store refreshStaleData() sets loaded: false, then refetches.
    act(() => {
      useSettingsStore.setState({ loaded: false });
    });
    expect(searchBox()?.value).toBe(QUERY);
    act(() => {
      useSettingsStore.setState({ loaded: true });
    });

    expect(searchBox()).toBe(input);
    expect(searchBox()?.value).toBe(QUERY);
    expect(screen.getByText(/no tools match/i)).toBeInTheDocument();
  });
});
