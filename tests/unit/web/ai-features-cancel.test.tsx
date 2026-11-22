// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en, type FeatureBundleState } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AiFeaturesSection polls disk usage on mount; keep it off the network.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet: vi.fn(async () => ({ totalBytes: 0 })),
}));

import { AiFeaturesSection } from "@/components/settings/ai-features-section";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFeaturesStore } from "@/stores/features-store";

function bundle(id: string): FeatureBundleState {
  return {
    id,
    name: id,
    description: id,
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "200 MB",
    enablesTools: [],
    progress: null,
    error: null,
  };
}

const cancelInstall = vi.fn(async (_bundleId: string) => {});

function renderSection(state: Partial<ReturnType<typeof useFeaturesStore.getState>>) {
  useFeaturesStore.setState({
    bundles: [bundle("transcription"), bundle("face-detection"), bundle("ocr")],
    loaded: true,
    loadError: false,
    bundlesStale: false,
    installing: {},
    errors: {},
    queued: [],
    canceling: [],
    installAllActive: false,
    startTimes: {},
    fetch: vi.fn(),
    cancelInstall,
    ...state,
  });
  render(
    <I18nProvider>
      <AiFeaturesSection />
    </I18nProvider>,
  );
}

const cancelButtons = () => screen.queryAllByRole("button", { name: en.common.cancel });

beforeEach(() => {
  cancelInstall.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("AiFeaturesSection install cancel (#4763)", () => {
  it("offers Cancel on a running and a queued install, and cancels the clicked one", () => {
    renderSection({
      installing: { transcription: { percent: 40, stage: "Downloading" } },
      queued: ["face-detection"],
    });

    const buttons = cancelButtons();
    expect(buttons).toHaveLength(2);
    fireEvent.click(buttons[0]);
    expect(cancelInstall).toHaveBeenCalledWith("transcription");
    fireEvent.click(buttons[1]);
    expect(cancelInstall).toHaveBeenCalledWith("face-detection");
  });

  it("disables Cancel while the cancel is in flight", () => {
    renderSection({
      installing: { transcription: { percent: 40, stage: "Downloading" } },
      canceling: ["transcription"],
    });

    const [button] = cancelButtons();
    expect(button).toBeDisabled();
  });

  it("offers Cancel on a started Accurate OCR install (#4979)", () => {
    renderSection({ installing: { ocr: { percent: 40, stage: "Downloading" } } });

    const buttons = cancelButtons();
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(cancelInstall).toHaveBeenCalledWith("ocr");
  });
});
