// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { FeatureBundleState } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-auth", () => ({ useAuth }));

import { OcrQualityControl, useOcrQuality } from "@/components/tools/ocr-quality-control";
import { useFeaturesStore } from "@/stores/features-store";

function ocrBundle(overrides: Partial<FeatureBundleState> = {}): FeatureBundleState {
  return {
    id: "ocr",
    name: "OCR",
    description: "Accurate local OCR",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "~300 MB",
    downloadBytes: 293_502_277,
    missingDownloadBytes: 293_502_277,
    compatibility: "compatible",
    compatibilityReason: "descriptor-missing",
    selectedTarget: "linux-amd64-cpu-py312",
    healthyGeneration: null,
    availableQualities: ["fast"],
    enablesTools: ["ocr", "ocr-pdf"],
    progress: null,
    error: null,
    ...overrides,
  };
}

function Harness({ initialLanguage = "auto" }: { initialLanguage?: string }) {
  const [language, setLanguage] = useState(initialLanguage);
  const { quality, setQuality, canRun } = useOcrQuality(language);
  return (
    <>
      <output data-testid="quality">{quality}</output>
      <output data-testid="can-run">{String(canRun)}</output>
      <output data-testid="language">{language}</output>
      <button type="button" onClick={() => setLanguage(language === "ko" ? "auto" : "ko")}>
        Toggle Korean
      </button>
      <OcrQualityControl quality={quality} language={language} onChange={setQuality} />
    </>
  );
}

beforeEach(() => {
  useAuth.mockReturnValue({ hasPermission: () => true });
  useFeaturesStore.setState({
    bundles: [ocrBundle()],
    loaded: true,
    loadError: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    installBundle: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("OCR optional accurate pack control", () => {
  it("defaults to runnable Fast and offers an exact-size install for an accurate tier", () => {
    const installBundle = vi.fn();
    useFeaturesStore.setState({ installBundle });
    render(<Harness />);

    expect(screen.getByTestId("quality")).toHaveTextContent("fast");
    expect(screen.getByTestId("can-run")).toHaveTextContent("true");

    fireEvent.click(screen.getByRole("button", { name: "Balanced" }));

    expect(screen.getByTestId("can-run")).toHaveTextContent("false");
    expect(screen.getByText(/279\.9 MB/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Enable OCR/ }));
    expect(installBundle).toHaveBeenCalledWith("ocr");
  });

  it("defaults to Best when a healthy accurate runtime advertises it", () => {
    useFeaturesStore.setState({
      bundles: [
        ocrBundle({
          status: "installed",
          installedVersion: "3.0.0",
          missingDownloadBytes: 0,
          healthyGeneration: "generation-1",
          availableQualities: ["fast", "balanced", "best"],
        }),
      ],
    });

    render(<Harness />);

    expect(screen.getByTestId("quality")).toHaveTextContent("best");
    expect(screen.getByTestId("can-run")).toHaveTextContent("true");
    expect(screen.queryByRole("button", { name: /Enable OCR/ })).toBeNull();
  });

  it("defaults to Balanced when it is the best healthy accurate tier", () => {
    useFeaturesStore.setState({
      bundles: [
        ocrBundle({
          status: "installed",
          installedVersion: "3.0.0",
          missingDownloadBytes: 0,
          healthyGeneration: "generation-1",
          availableQualities: ["fast", "balanced"],
        }),
      ],
    });

    render(<Harness />);

    expect(screen.getByTestId("quality")).toHaveTextContent("balanced");
    expect(screen.getByTestId("can-run")).toHaveTextContent("true");
  });

  it("disables Fast with accessible guidance and requires the accurate pack for Korean", () => {
    render(<Harness initialLanguage="ko" />);

    expect(screen.getByTestId("quality")).toHaveTextContent("best");
    expect(screen.getByTestId("can-run")).toHaveTextContent("false");
    expect(screen.getByRole("button", { name: "Fast" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAccessibleDescription(
      /does not support Korean.*Accurate OCR pack.*Balanced or Best/i,
    );
    expect(screen.getByRole("button", { name: /Enable OCR/ })).toBeInTheDocument();
  });

  it("derives Balanced for Korean when it is the only available accurate tier", () => {
    useFeaturesStore.setState({
      bundles: [
        ocrBundle({
          status: "installed",
          installedVersion: "3.0.0",
          missingDownloadBytes: 0,
          healthyGeneration: "generation-1",
          availableQualities: ["fast", "balanced"],
        }),
      ],
    });

    render(<Harness initialLanguage="ko" />);

    expect(screen.getByTestId("quality")).toHaveTextContent("balanced");
    expect(screen.getByTestId("can-run")).toHaveTextContent("true");
  });

  it("restores ordinary defaults after switching away from Korean", () => {
    render(<Harness />);

    expect(screen.getByTestId("quality")).toHaveTextContent("fast");
    fireEvent.click(screen.getByRole("button", { name: "Toggle Korean" }));
    expect(screen.getByTestId("quality")).toHaveTextContent("best");
    expect(screen.getByRole("button", { name: "Fast" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Toggle Korean" }));
    expect(screen.getByTestId("quality")).toHaveTextContent("fast");
    expect(screen.getByRole("button", { name: "Fast" })).toBeEnabled();
  });
});
