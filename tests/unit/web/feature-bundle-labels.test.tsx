// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  en,
  FEATURE_BUNDLES,
  type FeatureBundleState,
  loadTranslations,
  PIPELINE_TEMPLATES,
  SUPPORTED_LOCALES,
  type TranslationKeys,
} from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it (same stub as shared-data-labels.test.tsx).
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

// AiFeaturesSection polls disk usage on mount; keep it off the network.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet: vi.fn(async () => ({ totalBytes: 0 })),
}));

import { TemplateCard } from "@/components/automate/template-card";
import { FeatureInstallPrompt } from "@/components/features/feature-install-prompt";
import { AiInstallIndicator } from "@/components/layout/ai-install-indicator";
import { AiFeaturesSection } from "@/components/settings/ai-features-section";
import { I18nProvider } from "@/contexts/i18n-context";
import { bundleDescription, bundleName } from "@/lib/bundle-i18n";
import { useFeaturesStore } from "@/stores/features-store";

function bundleState(id: string, overrides: Partial<FeatureBundleState> = {}): FeatureBundleState {
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
    ...overrides,
  };
}

function renderDe(ui: React.ReactNode) {
  storage.set("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

const deBundles = (de as TranslationKeys).featureBundles as Record<
  string,
  { name: string; description: string }
>;

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
    fetch: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("feature bundle labels are translatable (#910)", () => {
  it("has an en name and description for every bundle, matching the shared data", () => {
    const block = en.featureBundles as Record<string, { name: string; description: string }>;
    for (const bundle of Object.values(FEATURE_BUNDLES)) {
      expect(block[bundle.id]?.name, `${bundle.id}.name`).toBe(bundle.name);
      expect(block[bundle.id]?.description, `${bundle.id}.description`).toBe(bundle.description);
    }
    expect(Object.keys(block).sort()).toEqual(Object.keys(FEATURE_BUNDLES).sort());
  });

  it("has a non-empty name and description for every bundle in every locale", async () => {
    for (const locale of SUPPORTED_LOCALES) {
      const translations = await loadTranslations(locale.code);
      const block = translations.featureBundles as Record<
        string,
        { name?: string; description?: string }
      >;
      for (const id of Object.keys(FEATURE_BUNDLES)) {
        expect(block[id]?.name, `${locale.code} ${id}.name`).toBeTruthy();
        expect(block[id]?.description, `${locale.code} ${id}.description`).toBeTruthy();
      }
    }
  });

  it("translates every non-English locale rather than copying English", async () => {
    const enBlock = en.featureBundles as Record<string, { description: string }>;
    for (const locale of SUPPORTED_LOCALES) {
      if (locale.code === "en") continue;
      const translations = await loadTranslations(locale.code);
      // loadTranslations falls back to en when a locale fails to load, so this
      // also catches a broken locale module, not only a pasted-English block.
      expect(translations, locale.code).not.toBe(en);
      const block = translations.featureBundles as Record<string, { description: string }>;
      const translated = Object.keys(FEATURE_BUNDLES).filter(
        (id) => block[id].description !== enBlock[id].description,
      );
      expect(translated.length, locale.code).toBe(Object.keys(FEATURE_BUNDLES).length);
    }
  });

  it("resolves by bundle id in the active locale and falls back to the server string", () => {
    const bg = bundleState("background-removal");
    expect(bundleName(de, bg)).toBe(deBundles["background-removal"].name);
    expect(bundleName(de, bg)).not.toBe(bg.name);
    expect(bundleDescription(de, bg)).toBe(deBundles["background-removal"].description);
    expect(bundleDescription(de, bg)).not.toBe(bg.description);

    const custom = { id: "custom-bundle", name: "Custom Models", description: "Site-local models" };
    expect(bundleName(de, custom)).toBe("Custom Models");
    expect(bundleDescription(de, custom)).toBe("Site-local models");
  });

  it("renders the install prompt's bundle name and description in the active locale", async () => {
    renderDe(<FeatureInstallPrompt bundle={bundleState("background-removal")} isAdmin />);

    expect(await screen.findByText(deBundles["background-removal"].name)).toBeInTheDocument();
    expect(screen.getByText(deBundles["background-removal"].description)).toBeInTheDocument();
    expect(screen.queryByText("Background Removal")).not.toBeInTheDocument();
    expect(screen.queryByText(FEATURE_BUNDLES["background-removal"].description)).toBeNull();
  });

  it("renders the multi-bundle breakdown names in the active locale", async () => {
    useFeaturesStore.setState({
      bundles: [bundleState("background-removal"), bundleState("face-detection")],
    });
    renderDe(
      <FeatureInstallPrompt
        bundle={bundleState("background-removal")}
        isAdmin
        toolId="passport-photo"
        toolName="Passfoto"
      />,
    );

    expect(await screen.findByText(deBundles["background-removal"].name)).toBeInTheDocument();
    expect(screen.getByText(deBundles["face-detection"].name)).toBeInTheDocument();
    expect(screen.queryByText("Face Detection")).not.toBeInTheDocument();
  });

  it("names the installing bundle in the active locale in the install indicator", async () => {
    useFeaturesStore.setState({
      bundles: [bundleState("face-detection")],
      installing: { "face-detection": { percent: 40, stage: "Downloading" } },
    });
    renderDe(<AiInstallIndicator />);

    const name = deBundles["face-detection"].name;
    expect(await screen.findByText((text) => text.includes(name))).toBeInTheDocument();
    expect(screen.queryByText(/Face Detection/)).not.toBeInTheDocument();
  });

  it("renders the Settings bundle cards in the active locale", async () => {
    useFeaturesStore.setState({
      bundles: [bundleState("photo-restoration"), bundleState("transcription")],
    });
    renderDe(<AiFeaturesSection />);

    expect(await screen.findByText(deBundles["photo-restoration"].name)).toBeInTheDocument();
    expect(screen.getByText(deBundles.transcription.name)).toBeInTheDocument();
    expect(
      screen.getByText((text) => text.startsWith(deBundles["photo-restoration"].description)),
    ).toBeInTheDocument();
    expect(screen.queryByText("Photo Restoration")).not.toBeInTheDocument();
    expect(
      screen.queryByText((text) => text.includes(FEATURE_BUNDLES.transcription.description)),
    ).toBeNull();
  });

  it("labels a template's required bundles in the active locale", async () => {
    const template = PIPELINE_TEMPLATES.find((tpl) => tpl.id === "cut-out-subject");
    if (!template) throw new Error("cut-out-subject template missing");
    renderDe(<TemplateCard template={template} onUse={() => {}} />);

    await waitFor(() =>
      expect(
        screen.getByTestId("template-bundle-cut-out-subject-background-removal"),
      ).toHaveTextContent(deBundles["background-removal"].name),
    );
  });
});
