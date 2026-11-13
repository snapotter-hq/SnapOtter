// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const apiGetMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet: apiGetMock,
}));

// The layout's nav, dialogs and connection banner reach for the network on mount.
vi.mock("@/components/layout/app-layout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { ToolPalette } from "@/components/tools/tool-palette";
import { HomePage } from "@/pages/home-page";
import { usePinnedToolsStore } from "@/stores/pinned-tools-store";
import { useSettingsStore } from "@/stores/settings-store";

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
  usePinnedToolsStore.setState({ fetch: async () => {} });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  apiGetMock.mockReset();
});

const presetLink = () => document.querySelector('a[href$="/heic-to-jpg"]');
const siblingLink = () => document.querySelector('a[href$="/resize"]');

// #4462: the API drops a preset's route when its base tool is disabled (#4288),
// so the web filters must hide the preset by the same rule.
describe("home page hides presets whose base tool is disabled", () => {
  function renderHome(disabledTools: string[]) {
    useSettingsStore.setState({
      disabledTools,
      experimentalEnabled: false,
      loaded: true,
      loadError: false,
      fetch: async () => {},
    });
    render(
      <MemoryRouter initialEntries={["/"]}>
        <HomePage />
      </MemoryRouter>,
    );
  }

  it("lists the preset when nothing is disabled", () => {
    renderHome([]);
    expect(presetLink()).not.toBeNull();
  });

  it("hides the preset when its base is disabled and keeps unrelated tools", () => {
    renderHome(["convert"]);
    expect(presetLink()).toBeNull();
    expect(siblingLink()).not.toBeNull();
  });
});

describe("pipeline tool palette hides presets whose base tool is disabled", () => {
  function renderPalette(disabledTools: string[]) {
    apiGetMock.mockImplementation(async (path: string) => {
      if (path === "/v1/settings") {
        return { settings: { disabledTools: JSON.stringify(disabledTools) } };
      }
      throw new Error(`unexpected apiGet ${path}`);
    });
    render(<ToolPalette onAddStep={() => {}} />);
  }

  it("lists the preset when nothing is disabled", async () => {
    renderPalette([]);
    await waitFor(() => expect(apiGetMock).toHaveBeenCalledWith("/v1/settings"));
    expect(screen.getByText("HEIC to JPG")).toBeInTheDocument();
  });

  it("hides the preset once settings report its base disabled", async () => {
    renderPalette(["convert"]);
    await waitFor(() => expect(screen.queryByText("HEIC to JPG")).toBeNull());
    expect(screen.getByText("Compress Image to 100 KB")).toBeInTheDocument();
  });
});
