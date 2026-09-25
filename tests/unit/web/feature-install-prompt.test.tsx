// @vitest-environment jsdom

import type { FeatureBundleState } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it, so give it a real in-memory one.
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { FeatureInstallPrompt } from "@/components/features/feature-install-prompt";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFeaturesStore } from "@/stores/features-store";

function makeBundleState(overrides: Partial<FeatureBundleState> = {}): FeatureBundleState {
  return {
    id: "background-removal",
    name: "Background Removal",
    description: "Remove backgrounds",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "4-5 GB",
    enablesTools: ["remove-background", "passport-photo"],
    progress: null,
    error: null,
    ...overrides,
  };
}

describe("FeatureInstallPrompt", () => {
  beforeEach(() => {
    useFeaturesStore.setState({
      bundles: [],
      loaded: true,
      loadError: false,
      installing: {},
      errors: {},
      queued: [],
      installAllActive: false,
      startTimes: {},
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("uses the tool-aware install action when a tool id is provided", () => {
    const installTool = vi.fn();
    const installBundle = vi.fn();
    useFeaturesStore.setState({ installTool, installBundle });

    render(
      <FeatureInstallPrompt
        bundle={makeBundleState()}
        isAdmin
        toolId="passport-photo"
        toolName="Passport Photo"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Enable Passport Photo" }));

    expect(installTool).toHaveBeenCalledWith("passport-photo");
    expect(installBundle).not.toHaveBeenCalled();
  });

  it("shows every required bundle and keeps installed dependencies clear", () => {
    const installTool = vi.fn();
    const installBundle = vi.fn();
    const backgroundRemoval = makeBundleState({ status: "installed" });
    const faceDetection = makeBundleState({
      id: "face-detection",
      name: "Face Detection",
      description: "Detect faces",
      status: "not_installed",
      estimatedSize: "200-300 MB",
      enablesTools: ["blur-faces", "red-eye-removal", "smart-crop"],
    });
    useFeaturesStore.setState({
      bundles: [backgroundRemoval, faceDetection],
      installTool,
      installBundle,
    });

    render(
      <FeatureInstallPrompt
        bundle={faceDetection}
        isAdmin
        toolId="passport-photo"
        toolName="Passport Photo"
      />,
    );

    expect(screen.getByText("Background Removal")).toBeTruthy();
    expect(screen.getByText("Face Detection")).toBeTruthy();
    expect(screen.getByText("Installed")).toBeTruthy();
    expect(screen.getByText("Not installed")).toBeTruthy();
    expect(screen.getByText("200-300 MB")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Enable Passport Photo" }));

    expect(installTool).toHaveBeenCalledWith("passport-photo");
    expect(installBundle).not.toHaveBeenCalled();
  });

  it("keeps the multi-bundle breakdown visible when one bundle is in the error/repair state", () => {
    const backgroundRemoval = makeBundleState({
      status: "error",
      error: "Checksum mismatch",
    });
    const faceDetection = makeBundleState({
      id: "face-detection",
      name: "Face Detection",
      description: "Detect faces",
      status: "installed",
      estimatedSize: "200-300 MB",
      enablesTools: ["blur-faces", "red-eye-removal", "smart-crop"],
    });
    useFeaturesStore.setState({
      bundles: [backgroundRemoval, faceDetection],
      installTool: vi.fn(),
      installBundle: vi.fn(),
    });

    render(
      <FeatureInstallPrompt
        bundle={backgroundRemoval}
        isAdmin
        toolId="passport-photo"
        toolName="Passport Photo"
      />,
    );

    // The breakdown must still render during repair so the user can see the
    // sibling bundle's state, not just the single failed one.
    expect(screen.getByText("Background Removal")).toBeTruthy();
    expect(screen.getByText("Face Detection")).toBeTruthy();
    expect(screen.getByText("Installed")).toBeTruthy();
  });
});

// Without a provider `t` defaults to `en`, where the pre-#1145 hardcoded
// literals and the catalog values are byte-identical, so an English assertion
// can't tell them apart. Render under a stored `de` choice instead.
describe("FeatureInstallPrompt download ETA (#1145)", () => {
  const NOW = 1_700_000_000_000;
  const BUNDLE_ID = "background-removal";

  beforeEach(() => {
    storage.set("snapotter-locale", "de");
    vi.spyOn(Date, "now").mockReturnValue(NOW);
  });

  afterEach(() => {
    storage.clear();
  });

  // At 50% the remaining estimate equals the elapsed time, so elapsedMs picks
  // the branch directly: under a minute, rounds to one minute, rounds to N.
  it.each([
    ["under a minute", 30_000, de.features.lessThanMinute],
    ["about one minute", 75_000, de.features.oneMinuteLeft],
    ["several minutes", 180_000, de.features.minutesLeft.replace("{mins}", "3")],
  ])("renders the %s ETA from the active locale", async (_label, elapsedMs, expected) => {
    useFeaturesStore.setState({
      installing: { [BUNDLE_ID]: { percent: 50, stage: "Downloading" } },
      startTimes: { [BUNDLE_ID]: NOW - elapsedMs },
    });

    render(
      <I18nProvider>
        <FeatureInstallPrompt bundle={makeBundleState()} isAdmin />
      </I18nProvider>,
    );

    expect(await screen.findByText(expected)).toBeTruthy();
    expect(screen.queryByText(/minutes? left/)).toBeNull();
    expect(screen.queryByText(/\{mins\}/)).toBeNull();
  });
});
