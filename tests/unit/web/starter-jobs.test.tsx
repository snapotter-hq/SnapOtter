// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { ANALYTICS_EVENTS, TOOLS } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({ role: "admin" as string | null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ role: authState.role }) }));

const trackMock = vi.hoisted(() => vi.fn());
vi.mock("@/lib/lazy-analytics", () => ({
  withAnalytics: (use: (analytics: { track: typeof trackMock }) => void) =>
    use({ track: trackMock }),
}));

import {
  STARTER_DISMISSED_STORAGE_KEY,
  STARTER_JOBS,
  StarterJobs,
  shouldShowStarterJobs,
} from "@/components/onboarding/starter-jobs";
import { useSettingsStore } from "@/stores/settings-store";

// This jsdom setup has no working localStorage; same Map-backed stub as
// home-search-before-settings.test.tsx.
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

const ALL_TOOLS = TOOLS.filter((tool) => !tool.disabled);

function renderStarter(visibleTools = ALL_TOOLS) {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <StarterJobs visibleTools={visibleTools} />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  authState.role = "admin";
  trackMock.mockClear();
  useSettingsStore.setState({ loaded: true, instanceHasProcessed: false });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("shouldShowStarterJobs (#4909)", () => {
  const base = {
    loaded: true,
    role: "admin",
    instanceHasProcessed: false,
    hasRecentTools: false,
    dismissed: false,
  };

  it("shows for an admin on an instance that has never processed a file", () => {
    expect(shouldShowStarterJobs(base)).toBe(true);
  });

  it.each([
    ["settings not loaded", { loaded: false }],
    ["non-admin (cannot read the processed marker)", { role: "user" }],
    ["unknown role", { role: null }],
    ["instance already processed a file", { instanceHasProcessed: true }],
    ["this browser already opened a tool", { hasRecentTools: true }],
    ["dismissed", { dismissed: true }],
  ])("hides when %s", (_label, override) => {
    expect(shouldShowStarterJobs({ ...base, ...override })).toBe(false);
  });
});

describe("StarterJobs (#4909)", () => {
  it("every starter tool id exists in the catalog", () => {
    const ids = new Set(TOOLS.map((tool) => tool.id));
    for (const job of STARTER_JOBS) {
      for (const id of job.toolIds) expect(ids.has(id)).toBe(true);
    }
  });

  it("links each starter job to its tool page, in order", () => {
    renderStarter();
    expect(screen.getByTestId("starter-jobs")).toBeInTheDocument();
    const links = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("data-testid")?.replace("starter-job-", ""));
    expect(links).toEqual(STARTER_JOBS.flatMap((job) => job.toolIds));
    expect(screen.getByTestId("starter-job-remove-background").getAttribute("href")).toMatch(
      /^\/image\/remove-background$/,
    );
  });

  it("hides once the instance has processed a file", () => {
    useSettingsStore.setState({ instanceHasProcessed: true });
    renderStarter();
    expect(screen.queryByTestId("starter-jobs")).toBeNull();
  });

  it("hides for non-admins", () => {
    authState.role = "user";
    renderStarter();
    expect(screen.queryByTestId("starter-jobs")).toBeNull();
  });

  it("hides when this browser has recent tools", () => {
    storageMap.set("snapotter-recent-tools", JSON.stringify(["compress"]));
    renderStarter();
    expect(screen.queryByTestId("starter-jobs")).toBeNull();
  });

  it("dismisses and stays dismissed on the next render", () => {
    const { unmount } = renderStarter();
    fireEvent.click(screen.getByTestId("starter-jobs-dismiss"));
    expect(screen.queryByTestId("starter-jobs")).toBeNull();
    expect(storageMap.has(STARTER_DISMISSED_STORAGE_KEY)).toBe(true);
    unmount();
    renderStarter();
    expect(screen.queryByTestId("starter-jobs")).toBeNull();
  });

  it("drops disabled tools and whole jobs with nothing left", () => {
    renderStarter(ALL_TOOLS.filter((tool) => tool.id !== "remove-background"));
    expect(screen.queryByTestId("starter-job-remove-background")).toBeNull();
    expect(screen.getByTestId("starter-job-convert")).toBeInTheDocument();
    cleanup();
    renderStarter([]);
    expect(screen.queryByTestId("starter-jobs")).toBeNull();
  });

  it("tracks the click with the tool id", () => {
    renderStarter();
    fireEvent.click(screen.getByTestId("starter-job-merge-pdf"));
    expect(trackMock).toHaveBeenCalledWith(ANALYTICS_EVENTS.STARTER_JOB_CLICKED, {
      tool_id: "merge-pdf",
    });
  });
});
