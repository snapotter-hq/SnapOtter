// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1943: the editor's menu bar advertised shortcuts that ran a different
 * command or nothing. Export As said Ctrl+Shift+E, which flattens every
 * layer; New, Open, Close, Quick Export as PNG, Image Size and Canvas Size
 * named keys nothing listens for; and Select All named Ctrl+A, which selects
 * every object while the menu row makes a pixel selection.
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
import { EditorMenuBar } from "@/components/editor/editor-menu-bar";
import { I18nProvider } from "@/contexts/i18n-context";
import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";
import { useEditorStore } from "@/stores/editor-store";

const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const INITIAL_STATE = useEditorStore.getState();

/**
 * Every key string use-editor-shortcuts.ts hands to useHotkeys. Read from the
 * source because a vi.mock of the bare "react-hotkeys-hook" specifier doesn't
 * reach a package that only resolves under apps/web/node_modules.
 */
function editorBoundKeys(): string[] {
  const source = readFileSync(
    resolve(__dirname, "../../../apps/web/src/hooks/use-editor-shortcuts.ts"),
    "utf8",
  );
  return [...source.matchAll(/useHotkeys\(\s*"([^"]+)"/g)].flatMap((m) =>
    m[1].split(",").map((k) => k.trim()),
  );
}

const MENUS = ["file", "edit", "image", "layer", "select", "filter", "view"] as const;

function onWindows() {
  vi.spyOn(navigator, "platform", "get").mockReturnValue("Win32");
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(CHROME_WINDOWS);
  expect(navigator.platform).toBe("Win32");
}

function renderMenuBar(callbacks: Partial<Parameters<typeof EditorMenuBar>[0]> = {}) {
  const noop = () => {};
  render(
    <MemoryRouter>
      <I18nProvider>
        <EditorMenuBar
          onNewDocument={noop}
          onOpenImage={noop}
          onExport={noop}
          onSave={noop}
          onCanvasResize={noop}
          onImageResize={noop}
          {...callbacks}
        />
      </I18nProvider>
    </MemoryRouter>,
  );
}

/** Opens one menu and returns each top-level row's id and shown hint. */
function menuHints(menu: string): Map<string, string | null> {
  fireEvent.click(screen.getByTestId(`menu-${menu}`));
  const dropdown = screen.getByTestId(`menu-dropdown-${menu}`);
  const hints = new Map<string, string | null>();
  for (const row of dropdown.querySelectorAll<HTMLElement>(
    ":scope > [data-testid^='menu-item-'], :scope > div > [data-testid^='menu-item-']",
  )) {
    const id = row.dataset.testid?.replace("menu-item-", "") ?? "";
    const spans = row.querySelectorAll(":scope > span");
    hints.set(id, spans.length > 1 ? (spans[spans.length - 1].textContent ?? "") : null);
  }
  fireEvent.click(screen.getByTestId(`menu-${menu}`));
  return hints;
}

function allMenuHints(): Map<string, string | null> {
  const all = new Map<string, string | null>();
  for (const menu of MENUS) {
    for (const [id, hint] of menuHints(menu)) all.set(`${menu}/${id}`, hint);
  }
  return all;
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

describe("editor menu bar hints name keys that run the command (#1943)", () => {
  it("shows Export As on Ctrl+Shift+S, the key that opens the export dialog", () => {
    onWindows();
    renderMenuBar();
    expect(menuHints("file").get("export-as")).toBe("Ctrl+Shift+S");
  });

  it.each([
    ["file", "new"],
    ["file", "open"],
    ["file", "quick-export-as-png"],
    ["file", "close"],
    ["image", "image-size"],
    ["image", "canvas-size"],
    // Ctrl+A selects every object; this row makes a pixel selection instead.
    ["select", "all"],
  ])("shows no hint on %s > %s, which no key runs", (menu, id) => {
    onWindows();
    renderMenuBar();
    const hints = menuHints(menu);
    expect(hints.has(id)).toBe(true);
    expect(hints.get(id)).toBeNull();
  });

  it("names only keys the editor actually binds", () => {
    onWindows();
    // Export rides a raw capture-phase listener rather than useHotkeys; the
    // next test proves that key reaches it.
    const bound = new Set(
      [...editorBoundKeys(), "mod+shift+s"].map((k) => formatShortcut(k, false)).concat("Del"),
    );
    expect(bound.size).toBeGreaterThan(20);

    renderMenuBar();
    const unbound = [...allMenuHints()].filter(([, hint]) => hint !== null && !bound.has(hint));
    expect(unbound).toEqual([]);
  });

  it("opens the export dialog on Ctrl+Shift+S and not on Ctrl+Shift+E", () => {
    onWindows();
    const onExport = vi.fn();
    const flattenAll = vi.fn();
    useEditorStore.setState({ flattenAll });
    renderHook(() => useEditorShortcuts({ onExport }));

    fireEvent.keyDown(document, { key: "E", code: "KeyE", ctrlKey: true, shiftKey: true });
    expect(onExport).not.toHaveBeenCalled();
    expect(flattenAll).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: "S", code: "KeyS", ctrlKey: true, shiftKey: true });
    expect(onExport).toHaveBeenCalledTimes(1);
  });
});

describe("editor canvas context menu (#1943)", () => {
  it("shows no Ctrl+A on Select All, which makes a pixel selection rather than selecting objects", () => {
    onWindows();
    render(
      <I18nProvider>
        <ContextMenu position={{ x: 10, y: 10 }} menuType="canvas" onClose={() => {}} />
      </I18nProvider>,
    );
    const label = en.editor.ui.contextMenu.selectAll;
    const row = screen.getByRole("button", { name: new RegExp(`^${label}`) });
    expect((row.textContent ?? "").slice(label.length)).toBe("");
  });
});
