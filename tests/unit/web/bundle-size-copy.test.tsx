// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { FEATURE_BUNDLES, type FeatureBundleState } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const useAuth = vi.hoisted(() => vi.fn());
vi.mock("@/hooks/use-auth", () => ({ useAuth }));

// AiFeaturesSection polls disk usage on mount; keep it off the network.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet: vi.fn(async () => ({ totalBytes: 0 })),
}));

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as feature-bundle-labels.test.tsx).
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { FeatureInstallPrompt } from "@/components/features/feature-install-prompt";
import { AiFeaturesSection } from "@/components/settings/ai-features-section";
import { OcrQualityControl } from "@/components/tools/ocr-quality-control";
import { I18nProvider } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { useFeaturesStore } from "@/stores/features-store";

// No downloadBytes: the native-mode / manifest-less path that falls back to
// the shared data's estimatedSize string.
function bundleState(id: string): FeatureBundleState {
  const info = FEATURE_BUNDLES[id];
  return {
    id: info.id,
    name: info.name,
    description: info.description,
    status: "not_installed",
    installedVersion: null,
    estimatedSize: info.estimatedSize,
    enablesTools: info.enablesTools,
    progress: null,
    error: null,
  };
}

function renderDe(ui: React.ReactNode) {
  storage.set("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  storage.clear();
  useAuth.mockReturnValue({ hasPermission: () => true });
  useFeaturesStore.setState({
    bundles: [],
    loaded: true,
    loadError: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    fetch: vi.fn(async () => {}),
  });
});

afterEach(() => {
  cleanup();
});

describe("bundle size fallback copy (#1409)", () => {
  it("prints the OCR fallback size once, with one ~ and no English", async () => {
    renderDe(<FeatureInstallPrompt bundle={bundleState("ocr")} isAdmin />);

    const prefix = de.features.requiresDownload.split("(")[0];
    const line = await screen.findByText((text) => text.startsWith(prefix));
    expect(line.textContent).toContain(`(~${FEATURE_BUNDLES.ocr.estimatedSize})`);
    expect(line.textContent).not.toContain("~~");
    // "Download" is German too; the leak was the English words after the size.
    expect(line.textContent).not.toMatch(/MiB (download|installed)/);
  });

  it("does not double the ~ on the Settings card", async () => {
    useFeaturesStore.setState({ bundles: [bundleState("transcription"), bundleState("ocr")] });
    renderDe(<AiFeaturesSection />);

    await screen.findByText(de.featureBundles.transcription.name);
    const cards = document.body.textContent ?? "";
    expect(cards).toContain(`(~${FEATURE_BUNDLES.transcription.estimatedSize})`);
    expect(cards).toContain(`(~${FEATURE_BUNDLES.ocr.estimatedSize})`);
    expect(cards).not.toContain("~~");
    expect(cards).not.toMatch(/MiB (download|installed)/);
  });

  // The one product line this fix changed: with no OCR entry in the store yet
  // (features still loading, or a failed fetch), the control reads the shared
  // estimate instead of its own hard-coded copy of the old string.
  it("OCR quality control falls back to the shared estimate, printed once", async () => {
    renderDe(<OcrQualityControl quality="balanced" onChange={() => {}} language="auto" />);

    const expected = format(de.features.requiresDownload, {
      size: FEATURE_BUNDLES.ocr.estimatedSize,
    });
    expect(await screen.findByText(expected)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("~~");
  });
});
