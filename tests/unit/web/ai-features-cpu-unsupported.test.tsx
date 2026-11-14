// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en, type FeatureBundleState } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AiFeaturesSection polls disk usage on mount; keep it off the network.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet: vi.fn(async () => ({ totalBytes: 0 })),
}));

import { AiFeaturesSection } from "@/components/settings/ai-features-section";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFeaturesStore } from "@/stores/features-store";

function bundle(id: string, name: string, extra: Partial<FeatureBundleState> = {}) {
  return {
    id,
    name,
    description: name,
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "200 MB",
    enablesTools: [],
    progress: null,
    error: null,
    ...extra,
  } satisfies FeatureBundleState;
}

const installBundle = vi.fn(async () => {});

beforeEach(() => {
  installBundle.mockClear();
  useFeaturesStore.setState({
    bundles: [
      bundle("face-detection", "Face Detection", {
        compatibility: "incompatible",
        compatibilityReason: "cpu-no-avx",
      }),
      bundle("transcription", "Transcription"),
    ],
    loaded: true,
    loadError: false,
    bundlesStale: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    fetch: vi.fn(),
    installBundle,
  });
});

afterEach(() => {
  cleanup();
});

function card(name: string): HTMLElement {
  const title = screen.getAllByText(name)[0];
  const el = title.closest(".rounded-lg");
  if (!(el instanceof HTMLElement)) throw new Error(`no card for ${name}`);
  return el;
}

describe("AiFeaturesSection on a CPU without AVX (#4680)", () => {
  it("disables the bundle's Install button and says why", () => {
    render(
      <I18nProvider>
        <AiFeaturesSection />
      </I18nProvider>,
    );

    const face = card("Face Detection");
    const button = within(face).getByRole("button", { name: en.settings.aiFeatures.install });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(en.errors.codes.FEATURE_CPU_UNSUPPORTED);
    fireEvent.click(button);
    expect(installBundle).not.toHaveBeenCalled();
  });

  it("leaves other bundles installable", () => {
    render(
      <I18nProvider>
        <AiFeaturesSection />
      </I18nProvider>,
    );

    const other = card("Transcription");
    const button = within(other).getByRole("button", { name: en.settings.aiFeatures.install });
    expect(button).toBeEnabled();
    expect(within(other).queryByText(en.errors.codes.FEATURE_CPU_UNSUPPORTED)).toBeNull();
    fireEvent.click(button);
    expect(installBundle).toHaveBeenCalledWith("transcription");
  });
});
