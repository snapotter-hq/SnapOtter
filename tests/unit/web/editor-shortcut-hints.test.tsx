// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1820: the editor's undo, redo, new-layer and paste hints had "Ctrl" baked
 * into the translated string, so a Mac showed "Undo (Ctrl+Z)" while the
 * handler only answers Cmd+Z.
 */

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { de } from "@snapotter/shared/i18n/de.js";
import { en } from "@snapotter/shared/i18n/en.js";
import { WelcomeScreen } from "@/components/editor/common/welcome-screen";
import { HistoryPanel } from "@/components/editor/panels/history-panel";
import { LayersPanel } from "@/components/editor/panels/layers-panel";
import { I18nProvider } from "@/contexts/i18n-context";
import { hotkeysModIsMeta } from "@/lib/platform";
import { useEditorStore } from "@/stores/editor-store";

const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const SAFARI_IPAD_MOBILE =
  "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

const INITIAL_STATE = useEditorStore.getState();

function onDevice(platform: string, userAgent: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  // A spy that silently failed would leave the Ctrl cases passing on jsdom's
  // own (non-Apple) values.
  expect(navigator.platform).toBe(platform);
  expect(navigator.userAgent).toBe(userAgent);
}

async function renderHints(locale: "en" | "de" = "en") {
  storage.set("snapotter-locale", locale);
  const bundle = locale === "de" ? de : en;
  render(
    <I18nProvider>
      <HistoryPanel />
      <LayersPanel />
      <WelcomeScreen />
    </I18nProvider>,
  );
  // Non-English bundles load asynchronously; wait for the active one.
  const undo = await screen.findByRole("button", { name: bundle.a11y.undo });
  return {
    undo: undo.getAttribute("title"),
    redo: screen.getByRole("button", { name: bundle.a11y.redo }).getAttribute("title"),
    newLayer: screen.getByTestId("add-layer-btn").getAttribute("title"),
    paste: screen.getByText(/clipboard|zwischenablage/i).textContent,
  };
}

beforeEach(() => {
  storage.clear();
  useEditorStore.setState(INITIAL_STATE, true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("editor shortcut hints (#1820)", () => {
  it("names Cmd on a Mac, where the editor's handlers want Cmd", async () => {
    onDevice("MacIntel", SAFARI_MAC);
    expect(await renderHints()).toEqual({
      undo: "Undo (⌘Z)",
      redo: "Redo (⌘⇧Z)",
      newLayer: "New Layer (⌘⇧N)",
      paste: "Or paste from clipboard (⌘V)",
    });
  });

  it("names Ctrl on Windows", async () => {
    onDevice("Win32", CHROME_WINDOWS);
    expect(await renderHints()).toEqual({
      undo: "Undo (Ctrl+Z)",
      redo: "Redo (Ctrl+Shift+Z)",
      newLayer: "New Layer (Ctrl+Shift+N)",
      paste: "Or paste from clipboard (Ctrl+V)",
    });
  });

  it("follows react-hotkeys-hook on an iPad with a mobile user agent, and the OS for native paste", async () => {
    // react-hotkeys-hook binds `mod` to Ctrl when the user agent names an
    // iPad, so that's the key the editor's handlers answer; the system paste
    // event still comes from Cmd+V there.
    onDevice("iPad", SAFARI_IPAD_MOBILE);
    expect(await renderHints()).toEqual({
      undo: "Undo (Ctrl+Z)",
      redo: "Redo (Ctrl+Shift+Z)",
      newLayer: "New Layer (Ctrl+Shift+N)",
      paste: "Or paste from clipboard (⌘V)",
    });
  });

  it("keeps the translated words around the shortcut in other locales", async () => {
    onDevice("MacIntel", SAFARI_MAC);
    const hints = await renderHints("de");
    expect(hints.undo).toBe(de.editor.panels.history.undoTitle.replace("{shortcut}", "⌘Z"));
    expect(hints.undo).toContain("Rückgängig");
    expect(hints.undo).not.toContain("{shortcut}");
  });
});

describe("hotkeysModIsMeta", () => {
  it.each([
    [SAFARI_MAC, true],
    [CHROME_WINDOWS, false],
    [SAFARI_IPAD_MOBILE, false],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      false,
    ],
  ])("reads %s as meta=%s, matching react-hotkeys-hook", (userAgent, expected) => {
    expect(hotkeysModIsMeta({ userAgent })).toBe(expected);
  });

  it("answers false without a navigator", () => {
    expect(hotkeysModIsMeta({})).toBe(false);
    vi.stubGlobal("navigator", undefined);
    try {
      expect(hotkeysModIsMeta()).toBe(false);
    } finally {
      vi.unstubAllGlobals();
      vi.stubGlobal("localStorage", {
        getItem: (k: string) => storage.get(k) ?? null,
        setItem: (k: string, v: string) => void storage.set(k, v),
        removeItem: (k: string) => void storage.delete(k),
        clear: () => storage.clear(),
      });
    }
  });
});
