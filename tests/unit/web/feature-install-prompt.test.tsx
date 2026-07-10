// @vitest-environment jsdom

import type { FeatureBundleState } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureInstallPrompt } from "@/components/features/feature-install-prompt";
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
