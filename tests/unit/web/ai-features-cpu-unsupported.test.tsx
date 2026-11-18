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

import { FeatureInstallPrompt } from "@/components/features/feature-install-prompt";
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

describe("an AVX bundle installed before the gate (#4680)", () => {
  it("drops Repair, which would uninstall it and then be refused, but keeps Uninstall", () => {
    useFeaturesStore.setState({
      bundles: [
        bundle("face-detection", "Face Detection", {
          status: "installed",
          compatibility: "incompatible",
          compatibilityReason: "cpu-no-avx",
        }),
      ],
    });
    render(
      <I18nProvider>
        <AiFeaturesSection />
      </I18nProvider>,
    );

    const face = card("Face Detection");
    expect(within(face).queryByRole("button", { name: en.settings.aiFeatures.repair })).toBeNull();
    expect(
      within(face).getByRole("button", { name: en.settings.aiFeatures.uninstall }),
    ).toBeEnabled();
    expect(within(face).getByText(en.errors.codes.FEATURE_CPU_UNSUPPORTED)).toBeInTheDocument();
  });
});

describe("FeatureInstallPrompt on a CPU without AVX (#4680)", () => {
  const face = bundle("face-detection", "Face Detection", {
    compatibility: "incompatible",
    compatibilityReason: "cpu-no-avx",
  });

  it("disables the tool page's enable button and says why", () => {
    const installTool = vi.fn(async () => {});
    useFeaturesStore.setState({ bundles: [face], installTool });
    render(
      <I18nProvider>
        <FeatureInstallPrompt bundle={face} isAdmin toolId="blur-faces" toolName="Blur Faces" />
      </I18nProvider>,
    );

    const button = screen.getByRole("button", { name: /Blur Faces/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAccessibleDescription(en.errors.codes.FEATURE_CPU_UNSUPPORTED);
    fireEvent.click(button);
    expect(installTool).not.toHaveBeenCalled();
  });

  it("keeps the button live when the CPU can run the bundle", () => {
    const installTool = vi.fn(async () => {});
    const ok = bundle("face-detection", "Face Detection");
    useFeaturesStore.setState({ bundles: [ok], installTool });
    render(
      <I18nProvider>
        <FeatureInstallPrompt bundle={ok} isAdmin toolId="blur-faces" toolName="Blur Faces" />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Blur Faces/ }));
    expect(installTool).toHaveBeenCalledWith("blur-faces");
  });
});
