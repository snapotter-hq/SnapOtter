// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import type { FeatureBundleState } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());
const processFiles = vi.hoisted(() => vi.fn());
const processAllFiles = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({ useAuth }));
vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles,
    processAllFiles,
    processing: false,
    error: null,
    downloadUrl: null,
    progress: null,
  }),
}));

import { OcrPdfSettings } from "@/components/tools/ocr-pdf-settings";
import { OcrSettings } from "@/components/tools/ocr-settings";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";

function fastOnlyOcrBundle(): FeatureBundleState {
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
  };
}

beforeEach(() => {
  useAuth.mockReturnValue({ hasPermission: () => true });
  useFeaturesStore.setState({
    bundles: [fastOnlyOcrBundle()],
    loaded: true,
    loadError: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    installBundle: vi.fn(),
  });
  useFileStore.setState({
    files: [new File(["input"], "input.png", { type: "image/png" })],
    processing: false,
    error: null,
  });
});

afterEach(() => {
  cleanup();
  useFileStore.setState({ files: [], processing: false, error: null });
  vi.clearAllMocks();
});

function expectKoreanAccuratePackContract(submit: HTMLElement) {
  expect(screen.getByRole("button", { name: "Fast" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Fast" })).toHaveAccessibleDescription(
    /does not support Korean.*Accurate OCR pack.*Balanced or Best/i,
  );
  expect(screen.getByRole("button", { name: "Best" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: /Enable OCR/ })).toBeInTheDocument();
  expect(submit).toBeDisabled();
}

describe("Korean OCR settings", () => {
  it("enforces the accurate-pack contract in the image OCR form and restores Fast", () => {
    render(<OcrSettings />);

    fireEvent.click(screen.getByRole("button", { name: /Language/i }));
    const language = screen.getByRole("combobox");
    const submit = screen.getByTestId("ocr-submit");

    fireEvent.change(language, { target: { value: "ko" } });
    expectKoreanAccuratePackContract(submit);

    fireEvent.change(language, { target: { value: "en" } });
    expect(screen.getByRole("button", { name: "Fast" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    expect(submit).toBeEnabled();
  });

  it("enforces the accurate-pack contract in the PDF OCR form and restores Fast", () => {
    render(<OcrPdfSettings />);

    const language = screen.getByLabelText("Language");
    const submit = screen.getByRole("button", { name: "Extract Text" });

    fireEvent.change(language, { target: { value: "ko" } });
    expectKoreanAccuratePackContract(submit);

    fireEvent.change(language, { target: { value: "en" } });
    expect(screen.getByRole("button", { name: "Fast" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Fast" })).toHaveAttribute("aria-pressed", "true");
    expect(submit).toBeEnabled();
  });
});
