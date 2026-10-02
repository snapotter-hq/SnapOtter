// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en, loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));

import { EraseObjectSettings } from "@/components/tools/erase-object-settings";
import type { EraserCanvasRef } from "@/components/tools/eraser-canvas";
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

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock-1");
  URL.revokeObjectURL = vi.fn();
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
