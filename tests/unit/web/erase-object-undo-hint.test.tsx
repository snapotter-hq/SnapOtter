// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import {
  en,
  FEATURE_BUNDLES,
  type FeatureBundleState,
  loadTranslations,
  SUPPORTED_LOCALES,
} from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hasPermission = vi.hoisted(() => vi.fn(() => true));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission }) }));

import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";

/**
 * #1945: the hint under the Erase Object canvas said "Use Ctrl+Z to undo" on
 * every platform. The canvas answers Cmd+Z and Ctrl+Z alike
 * (`eraser-canvas.tsx` checks `metaKey || ctrlKey`), so the hint follows the
 * app-wide `isApplePlatform()` rule and names Cmd on a Mac.
 */

const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

function onDevice(platform: string, userAgent: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  // A spy that silently failed would leave the Ctrl cases passing on jsdom's
  // own (non-Apple) values.
  expect(navigator.platform).toBe(platform);
  expect(navigator.userAgent).toBe(userAgent);
}

function fakeEraser(): EraserCanvasRef {
  return {
    exportMask: async () => null,
    exportAllMasks: async () => new Map(),
    getMaskCenter: () => null,
    clear: vi.fn(),
    clearAll: vi.fn(),
    undo: vi.fn(),
  };
}

function hintFor(mode: "brush" | "lasso"): string | null {
  render(
    <EraseObjectSettings
      eraserRef={{ current: fakeEraser() }}
      hasStrokes={false}
      brushSize={30}
      onBrushSizeChange={vi.fn()}
      mode={mode}
      onModeChange={vi.fn()}
      maskedFileCount={0}
    />,
  );
  const prefix = mode === "lasso" ? /^Draw a loop around/ : /^Paint over the objects/;
  return screen.getByText(prefix).textContent;
}

function hqBundle(overrides: Partial<FeatureBundleState> = {}): FeatureBundleState {
  const info = FEATURE_BUNDLES["inpaint-hq"];
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

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-1");
  URL.revokeObjectURL = vi.fn();
  hasPermission.mockReturnValue(true);
  useFeaturesStore.setState({
    bundles: [hqBundle()],
    loaded: true,
    loadError: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    installBundle: vi.fn(),
  });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["png"], "photo.png", { type: "image/png" })]);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  useFileStore.getState().reset();
});

describe("erase-object undo hint (#1945)", () => {
  it("names Cmd on a Mac", () => {
    onDevice("MacIntel", SAFARI_MAC);
    expect(hintFor("brush")).toBe("Paint over the objects you want to remove. Use ⌘Z to undo.");
    cleanup();
    expect(hintFor("lasso")).toBe(
      "Draw a loop around the object you want to remove. Use ⌘Z to undo.",
    );
  });

  it("names Ctrl on Windows", () => {
    onDevice("Win32", CHROME_WINDOWS);
    expect(hintFor("brush")).toBe("Paint over the objects you want to remove. Use Ctrl+Z to undo.");
    cleanup();
    expect(hintFor("lasso")).toBe(
      "Draw a loop around the object you want to remove. Use Ctrl+Z to undo.",
    );
  });
});

describe("erase-object undo hint placeholders in every locale", () => {
  it.each(SUPPORTED_LOCALES.map((l) => l.code))(
    "%s fills each hint through one {shortcut}",
    async (locale) => {
      const t = (await loadTranslations(locale)) as typeof en;
      // loadTranslations falls back to en for a code it doesn't know, which
      // would check en 21 times over.
      if (locale !== "en") expect(t).not.toBe(en);
      const { paintHint, lassoHint } = t.toolSettings["erase-object"];
      for (const [key, value] of Object.entries({ paintHint, lassoHint })) {
        // A literal modifier left in a string would show Ctrl on a Mac again.
        expect(value.match(/\{shortcut\}/g), `${locale} ${key}`).toHaveLength(1);
        expect(value, `${locale} ${key}`).not.toMatch(/\{(?!shortcut\})\w+\}|Ctrl|Strg|⌘/);
      }
    },
  );
});

describe("erase-object optional high-quality pack card (#4002)", () => {
  function renderEraserPanel() {
    return render(
      <EraseObjectSettings
        eraserRef={{ current: fakeEraser() }}
        hasStrokes
        brushSize={30}
        onBrushSizeChange={vi.fn()}
        mode="brush"
        onModeChange={vi.fn()}
        maskedFileCount={1}
      />,
    );
  }

  it("surfaces server hqBundle.error when local install error is unset", () => {
    useFeaturesStore.setState({
      bundles: [
        hqBundle({
          status: "error",
          error: "Model file missing or corrupted",
        }),
      ],
      errors: {},
    });

    renderEraserPanel();
    fireEvent.click(screen.getByTestId("eraser-quality-hq"));

    expect(screen.getByText("Model file missing or corrupted")).toBeInTheDocument();
    expect(screen.getByTestId("erase-object-submit")).toBeDisabled();
  });

  it("prefers local errors['inpaint-hq'] over server hqBundle.error", () => {
    useFeaturesStore.setState({
      bundles: [
        hqBundle({
          status: "error",
          error: "Model file missing or corrupted",
        }),
      ],
      errors: { "inpaint-hq": "Network timeout while downloading archive" },
    });

    renderEraserPanel();
    fireEvent.click(screen.getByTestId("eraser-quality-hq"));

    expect(screen.getByText("Network timeout while downloading archive")).toBeInTheDocument();
    expect(screen.queryByText("Model file missing or corrupted")).toBeNull();
  });

  it("renders install button for admins, disables it while installing or queued, and shows non-admin guidance otherwise", () => {
    const installBundle = vi.fn();
    useFeaturesStore.setState({
      bundles: [hqBundle({ downloadBytes: 5_368_709_120 })],
      installBundle,
    });

    const { unmount } = renderEraserPanel();
    fireEvent.click(screen.getByTestId("eraser-quality-hq"));

    const installBtn = screen.getByTestId("eraser-install-hq");
    expect(installBtn).toBeEnabled();
    fireEvent.click(installBtn);
    expect(installBundle).toHaveBeenCalledWith("inpaint-hq");

    unmount();
    useFeaturesStore.setState({
      installing: { "inpaint-hq": { percent: 35, stage: "downloading" } },
    });
    const { unmount: unmountInstalling } = renderEraserPanel();
    fireEvent.click(screen.getByTestId("eraser-quality-hq"));
    expect(screen.getByTestId("eraser-install-hq")).toBeDisabled();
    expect(screen.getByTestId("eraser-install-hq")).toHaveTextContent(
      en.settings.aiFeatures.installing,
    );

    unmountInstalling();
    useFeaturesStore.setState({
      installing: {},
      queued: ["inpaint-hq"],
    });
    const { unmount: unmountQueued } = renderEraserPanel();
    fireEvent.click(screen.getByTestId("eraser-quality-hq"));
    expect(screen.getByTestId("eraser-install-hq")).toBeDisabled();
    expect(screen.getByTestId("eraser-install-hq")).toHaveTextContent(
      en.settings.aiFeatures.installing,
    );

    unmountQueued();
    hasPermission.mockReturnValue(false);
    useFeaturesStore.setState({ queued: [] });
    const { unmount: unmountNonAdmin } = renderEraserPanel();
    fireEvent.click(screen.getByTestId("eraser-quality-hq"));
    expect(screen.queryByTestId("eraser-install-hq")).toBeNull();
    expect(screen.getByText(en.features.notEnabledDescription)).toBeInTheDocument();

    unmountNonAdmin();
    hasPermission.mockReturnValue(true);
    useFeaturesStore.setState({
      bundles: [hqBundle({ status: "installed" })],
    });
    renderEraserPanel();
    fireEvent.click(screen.getByTestId("eraser-quality-hq"));
    expect(screen.queryByTestId("eraser-install-hq")).toBeNull();
    expect(screen.getByTestId("erase-object-submit")).toBeEnabled();
  });
});
