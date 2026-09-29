// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { en } from "@snapotter/shared/i18n/en.js";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #1592: the History panel listed every step in English, because the store
 * wrote English text into lastAction. Assertions run against the German bundle,
 * since the provider defaults to en and an English assertion would pass either
 * way.
 */

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { HistoryPanel, historyActionLabel } from "@/components/editor/panels/history-panel";
import { I18nProvider } from "@/contexts/i18n-context";
import { format } from "@/lib/format";
import { useEditorStore } from "@/stores/editor-store";

const h = de.editor.panels.history.actions;
const adj = de.editor.panels.adjustments;

function renderIn(locale: "de" | "en") {
  localStorage.setItem("snapotter-locale", locale);
  return render(
    <I18nProvider>
      <HistoryPanel />
    </I18nProvider>,
  );
}

beforeEach(() => {
  storage.clear();
  useEditorStore.temporal.getState().clear();
});

afterEach(() => {
  cleanup();
});

describe("editor history labels (#1592)", () => {
  it("renders a plain step in the active locale", async () => {
    useEditorStore.getState().flipCanvasHorizontal();
    renderIn("de");

    expect(await screen.findByText(h.flipHorizontal)).toBeInTheDocument();
    expect(screen.queryByText("Flip Horizontal")).not.toBeInTheDocument();
  });

  it("fills parameterized steps with translated names", async () => {
    const s = useEditorStore.getState();
    s.setAdjustment("brightness", 10);
    s.toggleFilter("motionBlur");
    s.setFilterParam("vignette", "feather", 20);
    renderIn("de");

    expect(
      await screen.findByText(
        format(h.setFilterParam, { filter: adj.vignette, param: adj.params.feather }),
      ),
    ).toBeInTheDocument();
    // Past steps render below the current one.
    expect(
      screen.getByText(format(h.toggleFilter, { name: adj.filters.motionBlur })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(format(h.adjust, { name: adj.sliders.brightness })),
    ).toBeInTheDocument();
  });

  it("keeps the English labels readable, with filter names spelled out", async () => {
    const s = useEditorStore.getState();
    s.rotateCanvas(90);
    s.toggleFilter("motionBlur");
    renderIn("en");

    expect(await screen.findByText("Toggle Motion Blur Filter")).toBeInTheDocument();
    expect(screen.getByText("Rotate Canvas 90")).toBeInTheDocument();
    expect(en.editor.panels.history.actions.flipHorizontal).toBe("Flip Horizontal");
  });
});

describe("history actions recorded by the store (#1592)", () => {
  it("records ids with the parameters the label needs, not English text", () => {
    const s = () => useEditorStore.getState();
    s().rotateCanvas(180);
    expect(s().lastAction).toEqual({ id: "rotateCanvas", degrees: 180 });
    s().setAdjustment("warmth", 5);
    expect(s().lastAction).toEqual({ id: "adjust", key: "warmth" });
    s().toggleFilter("sepia");
    expect(s().lastAction).toEqual({ id: "toggleFilter", filter: "sepia" });
    s().setFilterParam("grain", "roughness", 10);
    expect(s().lastAction).toEqual({ id: "setFilterParam", filter: "grain", param: "roughness" });
    s().addObject({
      id: "t1",
      type: "text",
      layerId: s().activeLayerId,
      attrs: { x: 0, y: 0, text: "Hi", fontSize: 12, fontFamily: "sans-serif", fill: "#000" },
    } as Parameters<ReturnType<typeof useEditorStore.getState>["addObject"]>[0]);
    expect(s().lastAction).toEqual({ id: "addObject", objectType: "text" });
  });
});

describe("historyActionLabel (#1592)", () => {
  const t = en as unknown as Parameters<typeof historyActionLabel>[0];

  it("labels a missing action as unknown", () => {
    expect(historyActionLabel(t, undefined)).toBe(en.editor.panels.history.unknown);
  });

  it("falls back to the raw id for a filter or param it has no name for", () => {
    expect(historyActionLabel(t, { id: "toggleFilter", filter: "halftone" })).toBe(
      "Toggle halftone Filter",
    );
    expect(
      historyActionLabel(t, { id: "setFilterParam", filter: "grain", param: "dotAngle" }),
    ).toBe("Set Grain dotAngle");
  });

  it("names every shape type and every adjustment slider", () => {
    expect(historyActionLabel(t, { id: "addObject", objectType: "star" })).toBe("Add Star");
    expect(historyActionLabel(t, { id: "adjust", key: "vibrance" })).toBe("Adjust Vibrance");
  });
});
