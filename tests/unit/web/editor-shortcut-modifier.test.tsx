// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1935: the editor's context menu and Transform tooltip hard-coded "Ctrl",
 * and the menu bar counted an iPad as a Mac, so a hint could name a modifier
 * the react-hotkeys-hook handler doesn't answer. The context menu also
 * labelled Duplicate "Ctrl+D", which is the Deselect binding.
 */

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/components/editor/editor-canvas", () => ({
  editorStageRefHolder: { current: null },
}));

import { en } from "@snapotter/shared/i18n/en.js";
import { ContextMenu } from "@/components/editor/common/context-menu";
import { EditorToolbar } from "@/components/editor/editor-toolbar";
import { I18nProvider } from "@/contexts/i18n-context";
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
  expect(navigator.platform).toBe(platform);
  expect(navigator.userAgent).toBe(userAgent);
}

/** The text a context-menu row shows after its label: the shortcut, or "". */
function contextShortcut(label: string): string {
  const row = screen.getByRole("button", { name: new RegExp(`^${label}`) });
  return (row.textContent ?? "").slice(label.length);
}

function renderContextMenu(menuType: "object" | "canvas") {
  render(
    <I18nProvider>
      <ContextMenu position={{ x: 10, y: 10 }} menuType={menuType} onClose={() => {}} />
    </I18nProvider>,
  );
}

function contextMenuHints() {
  renderContextMenu("object");
  const object = {
    cut: contextShortcut(en.editor.menu.edit.cut),
    copy: contextShortcut(en.editor.menu.edit.copy),
    paste: contextShortcut(en.editor.menu.edit.paste),
    duplicate: contextShortcut(en.editor.ui.contextMenu.duplicate),
    delete: contextShortcut(en.editor.menu.edit.delete),
  };
  cleanup();
  renderContextMenu("canvas");
  return {
    ...object,
    canvasPaste: contextShortcut(en.editor.menu.edit.paste),
    selectAll: contextShortcut(en.editor.ui.contextMenu.selectAll),
  };
}

function transformTitle() {
  render(
    <I18nProvider>
      <EditorToolbar />
    </I18nProvider>,
  );
  return screen.getByTestId("tool-transform").getAttribute("title");
}

/**
 * Renders the menu bar from a fresh module graph, so a platform check made at
 * import time sees the device under test rather than jsdom's own user agent.
 */
async function menuBarShortcut(menu: string, itemId: string) {
  vi.resetModules();
  const { EditorMenuBar } = await import("@/components/editor/editor-menu-bar");
  const { I18nProvider: FreshI18nProvider } = await import("@/contexts/i18n-context");
  const noop = () => {};
  render(
    <MemoryRouter>
      <FreshI18nProvider>
        <EditorMenuBar
          onNewDocument={noop}
          onOpenImage={noop}
          onExport={noop}
          onSave={noop}
          onCanvasResize={noop}
          onImageResize={noop}
        />
      </FreshI18nProvider>
    </MemoryRouter>,
  );
  fireEvent.click(screen.getByTestId(`menu-${menu}`));
  const row = screen.getByTestId(`menu-item-${itemId}`);
  return row.lastElementChild?.textContent;
}

beforeEach(() => {
  storage.clear();
  storage.set("snapotter-locale", "en");
  useEditorStore.setState(INITIAL_STATE, true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("editor context menu shortcut hints (#1935)", () => {
  it("names Cmd on a Mac", () => {
    onDevice("MacIntel", SAFARI_MAC);
    expect(contextMenuHints()).toEqual({
      cut: "⌘X",
      copy: "⌘C",
      paste: "⌘V",
      duplicate: "",
      delete: "Del",
      canvasPaste: "⌘V",
      selectAll: "⌘A",
    });
  });

  it("names Ctrl on Windows", () => {
    onDevice("Win32", CHROME_WINDOWS);
    expect(contextMenuHints()).toEqual({
      cut: "Ctrl+X",
      copy: "Ctrl+C",
      paste: "Ctrl+V",
      duplicate: "",
      delete: "Del",
      canvasPaste: "Ctrl+V",
      selectAll: "Ctrl+A",
    });
  });

  it("names Ctrl on an iPad with a mobile user agent, as react-hotkeys-hook does", () => {
    onDevice("iPad", SAFARI_IPAD_MOBILE);
    const hints = contextMenuHints();
    expect(hints.cut).toBe("Ctrl+X");
    expect(hints.selectAll).toBe("Ctrl+A");
  });
});

describe("editor toolbar Transform tooltip (#1935)", () => {
  it.each([
    ["MacIntel", SAFARI_MAC, "⌘T"],
    ["Win32", CHROME_WINDOWS, "Ctrl+T"],
    ["iPad", SAFARI_IPAD_MOBILE, "Ctrl+T"],
  ])("on %s", (platform, userAgent, shortcut) => {
    onDevice(platform, userAgent);
    expect(transformTitle()).toBe(`${en.editor.menu.edit.freeTransform} (${shortcut})`);
  });

  it.each([
    ["Win32", CHROME_WINDOWS, "Shift+G"],
    ["MacIntel", SAFARI_MAC, "⇧G"],
  ])(
    "on %s renders the other tool shortcuts in the same style",
    (platform, userAgent, gradient) => {
      onDevice(platform, userAgent);
      render(
        <I18nProvider>
          <EditorToolbar />
        </I18nProvider>,
      );
      const title = (tool: string) => screen.getByTestId(`tool-${tool}`).getAttribute("title");
      expect(title("move")).toBe(`${en.editor.toolbar.move} (V)`);
      expect(title("gradient")).toBe(`${en.editor.toolbar.gradient} (${gradient})`);
      // No shortcut means no parentheses at all.
      expect(title("blur-brush")).toBe(en.editor.options.pixelBrush.blur);
    },
  );
});

describe("editor menu bar modifier (#1935)", () => {
  it.each([
    ["MacIntel", SAFARI_MAC, "⌘Z", "⌘⇧Z"],
    ["Win32", CHROME_WINDOWS, "Ctrl+Z", "Ctrl+Shift+Z"],
    // react-hotkeys-hook binds `mod` to Ctrl on this user agent, and the
    // History panel tooltip already says Ctrl+Z there.
    ["iPad", SAFARI_IPAD_MOBILE, "Ctrl+Z", "Ctrl+Shift+Z"],
  ])("on %s", async (platform, userAgent, undo, redo) => {
    onDevice(platform, userAgent);
    expect(await menuBarShortcut("edit", "undo")).toBe(undo);
    cleanup();
    expect(await menuBarShortcut("edit", "redo")).toBe(redo);
  });

  it.each([
    ["Win32", CHROME_WINDOWS, "Ctrl+D", "Ctrl+Alt+I", "Ctrl+=", "Ctrl+-"],
    ["MacIntel", SAFARI_MAC, "⌘D", "⌘⌥I", "⌘=", "⌘-"],
  ])("on %s formats Alt and punctuation keys", async (platform, userAgent, ...expected) => {
    onDevice(platform, userAgent);
    const shown: (string | null | undefined)[] = [];
    for (const [menu, item] of [
      ["select", "deselect"],
      ["image", "image-size"],
      ["view", "zoom-in"],
      ["view", "zoom-out"],
    ]) {
      shown.push(await menuBarShortcut(menu, item));
      cleanup();
    }
    expect(shown).toEqual(expected);
  });
});
