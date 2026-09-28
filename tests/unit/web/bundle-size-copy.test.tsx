// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { FEATURE_BUNDLES, type FeatureBundleState } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
import { I18nProvider } from "@/contexts/i18n-context";
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
  // Every render site wraps this value in its own "~" and its own words
  // (features.requiresDownload, the Settings card), so the data must be a
  // bare size range: digits and a unit, nothing to translate, no "~".
  it("keeps every estimatedSize a bare, locale-neutral size range", () => {
    for (const bundle of Object.values(FEATURE_BUNDLES)) {
      expect(bundle.estimatedSize, bundle.id).toMatch(
        /^\d+(\.\d+)?(-\d+(\.\d+)?)? (MB|GB|MiB|GiB)$/,
      );
    }
  });

  it("prints the OCR fallback size once, with one ~ and no English", async () => {
    renderDe(<FeatureInstallPrompt bundle={bundleState("ocr")} isAdmin />);

    const line = await screen.findByText((text) => text.startsWith("Diese Funktion erfordert"));
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
});
