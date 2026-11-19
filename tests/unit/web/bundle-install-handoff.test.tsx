// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { FeatureBundleState } from "@snapotter/shared";
import { en, TOOLS } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AiFeaturesSection polls disk usage on mount; keep it off the network.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet: vi.fn(async () => ({ totalBytes: 0 })),
}));

import { ToolDropzone } from "@/components/common/tool-dropzone";
import { AiFeaturesSection } from "@/components/settings/ai-features-section";
import { I18nProvider } from "@/contexts/i18n-context";
import { readyToolsForBundle, useJustInstalled } from "@/lib/bundle-install-handoff";
import { useFeaturesStore } from "@/stores/features-store";

function bundle(id: string, status: FeatureBundleState["status"]): FeatureBundleState {
  return {
    id,
    name: id,
    description: "",
    status,
    installedVersion: status === "installed" ? "1.0.0" : null,
    estimatedSize: "1 GB",
    enablesTools: [],
    progress: null,
    error: null,
  } as FeatureBundleState;
}

beforeEach(() => {
  useFeaturesStore.setState({
    bundles: [],
    loaded: true,
    loadError: false,
    bundlesStale: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    fetch: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe("readyToolsForBundle (#5040)", () => {
  it("lists only tools whose every required bundle is installed", () => {
    const bundles = [
      bundle("background-removal", "installed"),
      bundle("face-detection", "not_installed"),
    ];
    const ids = readyToolsForBundle("background-removal", bundles).map((tool) => tool.id);
    expect(ids).toContain("remove-background");
    // passport-photo also needs face-detection, so it isn't ready yet.
    expect(ids).not.toContain("passport-photo");
  });

  it("includes a multi-bundle tool once all its bundles are installed", () => {
    const bundles = [
      bundle("background-removal", "installed"),
      bundle("face-detection", "installed"),
    ];
    const ids = readyToolsForBundle("background-removal", bundles).map((tool) => tool.id);
    expect(ids).toContain("passport-photo");
  });

  it("returns nothing for an installed bundle this host can't run", () => {
    const incompatible = {
      ...bundle("photo-restoration", "installed"),
      compatibility: "incompatible",
      compatibilityReason: "cpu-no-avx",
    } as FeatureBundleState;
    expect(readyToolsForBundle("photo-restoration", [incompatible])).toEqual([]);
  });

  it("returns nothing for a bundle that isn't installed", () => {
    expect(readyToolsForBundle("ocr", [bundle("ocr", "not_installed")])).toEqual([]);
  });

  it("resolves each tool to its routed metadata", () => {
    const [first] = readyToolsForBundle("photo-restoration", [
      bundle("photo-restoration", "installed"),
    ]);
    expect(first?.route).toBe(TOOLS.find((tool) => tool.id === "restore-photo")?.route);
  });
});

describe("AiFeaturesSection ready links (#5040)", () => {
  it("links an installed bundle's ready tools to their pages", () => {
    useFeaturesStore.setState({ bundles: [bundle("photo-restoration", "installed")] });
    render(
      <MemoryRouter>
        <I18nProvider>
          <AiFeaturesSection />
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.getByText(en.settings.aiFeatures.readyTools)).toBeInTheDocument();
    const link = screen.getByRole("link", { name: en.tools["restore-photo"].name });
    expect(link).toHaveAttribute(
      "href",
      TOOLS.find((tool) => tool.id === "restore-photo")?.route ?? "",
    );
  });

  it("calls onNavigate when a ready link is followed, so the settings dialog closes", () => {
    useFeaturesStore.setState({ bundles: [bundle("photo-restoration", "installed")] });
    const onNavigate = vi.fn();
    render(
      <MemoryRouter>
        <I18nProvider>
          <AiFeaturesSection onNavigate={onNavigate} />
        </I18nProvider>
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("link", { name: en.tools["restore-photo"].name }));
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("caps a long list and says how many more are ready", () => {
    useFeaturesStore.setState({
      bundles: [bundle("background-removal", "installed"), bundle("face-detection", "installed")],
    });
    render(
      <MemoryRouter>
        <I18nProvider>
          <AiFeaturesSection />
        </I18nProvider>
      </MemoryRouter>,
    );

    // background-removal unlocks six tools: three links plus "and 3 more".
    expect(screen.getByText(en.toolPage.andMore.replace("{count}", "3"))).toBeInTheDocument();
  });

  it("shows no links for a bundle that isn't installed", () => {
    useFeaturesStore.setState({ bundles: [bundle("photo-restoration", "not_installed")] });
    render(
      <MemoryRouter>
        <I18nProvider>
          <AiFeaturesSection />
        </I18nProvider>
      </MemoryRouter>,
    );

    expect(screen.queryByText(en.settings.aiFeatures.readyTools)).not.toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("useJustInstalled (#5040)", () => {
  type Props = { toolId: string; promptShown: boolean; ready: boolean; hasFiles: boolean };
  const initial: Props = { toolId: "upscale", promptShown: true, ready: false, hasFiles: false };

  it("turns on when the install prompt gives way to the installed tool", () => {
    const { result, rerender } = renderHook(
      (p: Props) => useJustInstalled(p.toolId, p.promptShown, p.ready, p.hasFiles),
      { initialProps: initial },
    );
    expect(result.current).toBe(false);
    rerender({ ...initial, promptShown: false, ready: true });
    expect(result.current).toBe(true);
  });

  it("stays off when the tool was already installed on arrival", () => {
    const { result } = renderHook(() => useJustInstalled("upscale", false, true, false));
    expect(result.current).toBe(false);
  });

  it("clears once a file arrives and doesn't come back", () => {
    const { result, rerender } = renderHook(
      (p: Props) => useJustInstalled(p.toolId, p.promptShown, p.ready, p.hasFiles),
      { initialProps: initial },
    );
    rerender({ ...initial, promptShown: false, ready: true });
    act(() => rerender({ ...initial, promptShown: false, ready: true, hasFiles: true }));
    expect(result.current).toBe(false);
    rerender({ ...initial, promptShown: false, ready: true, hasFiles: false });
    expect(result.current).toBe(false);
  });

  it("doesn't carry over to a different tool", () => {
    const { result, rerender } = renderHook(
      (p: Props) => useJustInstalled(p.toolId, p.promptShown, p.ready, p.hasFiles),
      { initialProps: initial },
    );
    rerender({ ...initial, promptShown: false, ready: true });
    rerender({ ...initial, toolId: "noise-removal", promptShown: false, ready: true });
    expect(result.current).toBe(false);
  });
});

describe("ToolDropzone ready notice (#5040)", () => {
  const upscale = TOOLS.find((tool) => tool.id === "upscale");
  if (!upscale) throw new Error("upscale tool missing");

  it("announces the tool is ready above the dropzone", () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <ToolDropzone tool={upscale} onFiles={() => {}} justInstalled />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      en.toolPage.installedReady.replace("{tool}", en.tools.upscale.name),
    );
  });

  it("shows no notice by default", () => {
    render(
      <MemoryRouter>
        <I18nProvider>
          <ToolDropzone tool={upscale} onFiles={() => {}} />
        </I18nProvider>
      </MemoryRouter>,
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
