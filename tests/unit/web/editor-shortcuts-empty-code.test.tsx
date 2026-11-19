// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #4764: remote-desktop/automation keydowns carry an empty `event.code`, which
 * code-based react-hotkeys-hook bindings never match.
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

vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));

import { useEditorShortcuts } from "@/hooks/use-editor-shortcuts";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";
import { useEditorStore } from "@/stores/editor-store";

const SAFARI_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15";
const CHROME_WINDOWS =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

const INITIAL_STATE = useEditorStore.getState();

function onDevice(platform: string, userAgent: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  vi.spyOn(navigator, "userAgent", "get").mockReturnValue(userAgent);
  expect(navigator.platform).toBe(platform);
  expect(navigator.userAgent).toBe(userAgent);
}

function onWindows() {
  onDevice("Win32", CHROME_WINDOWS);
}

function ShortcutHarness({ onSave }: { onSave: () => void }) {
  useKeyboardShortcuts();
  useEditorShortcuts({ onSave });
  return null;
}

beforeEach(() => {
  storage.clear();
  useEditorStore.setState(INITIAL_STATE, true);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("editor shortcuts with an empty event.code (#4764)", () => {
  it.each([
    ["Win32", CHROME_WINDOWS, { ctrlKey: true }],
    ["MacIntel", SAFARI_MAC, { metaKey: true }],
  ] as const)("saves on mod+S on %s", (platform, userAgent, modifiers) => {
    onDevice(platform, userAgent);
    const onSave = vi.fn();
    renderHook(() => useEditorShortcuts({ onSave }));

    const notCanceled = fireEvent.keyDown(document.body, { key: "s", code: "", ...modifiers });

    expect(notCanceled).toBe(false);
    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("fires once for a physical Ctrl+S", () => {
    onWindows();
    const onSave = vi.fn();
    renderHook(() => useEditorShortcuts({ onSave }));

    fireEvent.keyDown(document.body, { key: "s", code: "KeyS", ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("still matches a non-Latin layout by code", () => {
    onWindows();
    const onSave = vi.fn();
    renderHook(() => useEditorShortcuts({ onSave }));

    fireEvent.keyDown(document.body, { key: "ы", code: "KeyS", ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("switches tools on a single-letter shortcut with an empty code", () => {
    onWindows();
    renderHook(() => useEditorShortcuts());
    useEditorStore.setState({ activeTool: "brush" });

    fireEvent.keyDown(document.body, { key: "v", code: "" });

    expect(useEditorStore.getState().activeTool).toBe("move");
  });

  it("changes brush size on a bracket shortcut with an empty code", () => {
    onWindows();
    renderHook(() => useEditorShortcuts());
    useEditorStore.setState({ brushSize: 20 });

    fireEvent.keyDown(document.body, { key: "]", code: "" });

    expect(useEditorStore.getState().brushSize).toBe(22);
  });

  it("toggles the right panel exactly once on Tab with an empty code", () => {
    onWindows();
    renderHook(() => useEditorShortcuts());
    useEditorStore.setState({ rightPanelVisible: true });

    fireEvent.keyDown(document.body, { key: "Tab", code: "" });

    expect(useEditorStore.getState().rightPanelVisible).toBe(false);
  });

  it("zooms on punctuation keys with an empty code", () => {
    onWindows();
    renderHook(() => useEditorShortcuts());
    useEditorStore.setState({ zoom: 1 });

    fireEvent.keyDown(document.body, { key: "=", code: "", ctrlKey: true });
    expect(useEditorStore.getState().zoom).toBeCloseTo(1.25);

    fireEvent.keyDown(document.body, { key: "-", code: "", ctrlKey: true });
    expect(useEditorStore.getState().zoom).toBeCloseTo(1);

    // The literal plus key cannot be written with the default "+" delimiter.
    fireEvent.keyDown(document.body, { key: "+", code: "", ctrlKey: true });
    expect(useEditorStore.getState().zoom).toBeCloseTo(1.25);

    // Shifted "+" on US-style layouts also zooms in.
    fireEvent.keyDown(document.body, { key: "-", code: "", ctrlKey: true });
    expect(useEditorStore.getState().zoom).toBeCloseTo(1);
    fireEvent.keyDown(document.body, { key: "+", code: "", ctrlKey: true, shiftKey: true });
    expect(useEditorStore.getState().zoom).toBeCloseTo(1.25);
  });

  it("matches shifted bracket keys with an empty code", () => {
    onWindows();
    const bringToFront = vi.fn();
    const sendToBack = vi.fn();
    useEditorStore.setState({ selectedObjectIds: ["obj-1"], bringToFront, sendToBack });
    renderHook(() => useEditorShortcuts());

    fireEvent.keyDown(document.body, { key: "}", code: "", ctrlKey: true, shiftKey: true });
    expect(bringToFront).toHaveBeenCalledWith("obj-1");

    fireEvent.keyDown(document.body, { key: "{", code: "", ctrlKey: true, shiftKey: true });
    expect(sendToBack).toHaveBeenCalledWith("obj-1");
  });

  it("undoes on mod+Z with an empty code", () => {
    onWindows();
    useEditorStore.temporal.getState().clear();
    useEditorStore.getState().flipCanvasHorizontal();
    const steps = () => useEditorStore.temporal.getState().pastStates.length;
    expect(steps()).toBe(1);
    renderHook(() => useEditorShortcuts());

    fireEvent.keyDown(document.body, { key: "z", code: "", ctrlKey: true });

    expect(steps()).toBe(0);
  });

  it("redoes on mod+shift+Z with an empty code", () => {
    onWindows();
    useEditorStore.temporal.getState().clear();
    useEditorStore.getState().flipCanvasHorizontal();
    useEditorStore.temporal.getState().undo();
    const future = () => useEditorStore.temporal.getState().futureStates.length;
    expect(future()).toBe(1);
    renderHook(() => useEditorShortcuts());

    fireEvent.keyDown(document.body, { key: "Z", code: "", ctrlKey: true, shiftKey: true });

    expect(future()).toBe(0);
  });

  it("does not switch tools on a single-letter key with an empty code inside an input", () => {
    onWindows();
    renderHook(() => useEditorShortcuts());
    useEditorStore.setState({ activeTool: "brush" });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    try {
      fireEvent.keyDown(input, { key: "v", code: "" });
      expect(useEditorStore.getState().activeTool).toBe("brush");
    } finally {
      input.remove();
    }
  });

  it("does not run the plain tool shortcut on Ctrl+V with an empty code", () => {
    onWindows();
    renderHook(() => useEditorShortcuts());
    useEditorStore.setState({ activeTool: "brush", clipboard: null });

    fireEvent.keyDown(document.body, { key: "v", code: "", ctrlKey: true });

    expect(useEditorStore.getState().activeTool).toBe("brush");
  });

  it("keeps Ctrl+Shift+S on export rather than save with an empty code", () => {
    onWindows();
    const onSave = vi.fn();
    const onExport = vi.fn();
    renderHook(() => useEditorShortcuts({ onSave, onExport }));

    fireEvent.keyDown(document.body, { key: "S", code: "", ctrlKey: true, shiftKey: true });

    expect(onExport).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("reaches save through the global Ctrl+S handler when code is empty", () => {
    onWindows();
    const onSave = vi.fn();
    render(
      <MemoryRouter>
        <ShortcutHarness onSave={onSave} />
      </MemoryRouter>,
    );

    fireEvent.keyDown(document.body, { key: "s", code: "", ctrlKey: true });

    expect(onSave).toHaveBeenCalledTimes(1);
  });

  it("does not double-fire after re-rendering", () => {
    onWindows();
    const onSave = vi.fn();
    const { rerender } = renderHook(() => useEditorShortcuts({ onSave }));

    fireEvent.keyDown(document.body, { key: "s", code: "", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(1);

    rerender();
    rerender();
    fireEvent.keyDown(document.body, { key: "s", code: "", ctrlKey: true });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("stays disabled for empty-code events when shortcuts are disabled", () => {
    onWindows();
    const onSave = vi.fn();
    renderHook(() => useEditorShortcuts({ onSave, disabled: true }));
    useEditorStore.setState({ activeTool: "brush" });

    const notCanceled = fireEvent.keyDown(document.body, { key: "s", code: "", ctrlKey: true });
    fireEvent.keyDown(document.body, { key: "v", code: "" });

    expect(notCanceled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
    expect(useEditorStore.getState().activeTool).toBe("brush");
  });
});
