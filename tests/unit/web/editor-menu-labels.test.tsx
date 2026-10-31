// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #923: the editor menu bar rendered hardcoded English while editor.menu.*
 * sat fully translated in all 21 locales. Assertions run against the German
 * bundle because the provider defaults to en, so English assertions would
 * pass with or without the wiring. The menu-item test ids come from a stable
 * per-item id that keeps the old English-label slugs: the editor e2e suite
 * selects on them, so they must not change with the locale.
 */

const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { EditorMenuBar } from "@/components/editor/editor-menu-bar";
import { I18nProvider } from "@/contexts/i18n-context";

const callbacks = {
  onNewDocument: () => {},
  onOpenImage: () => {},
  onExport: () => {},
  onSave: () => {},
  onCanvasResize: () => {},
  onImageResize: () => {},
};

function renderDe() {
  localStorage.setItem("snapotter-locale", "de");
  return render(
    <MemoryRouter>
      <I18nProvider>
        <EditorMenuBar {...callbacks} />
      </I18nProvider>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("editor menu bar i18n (#923)", () => {
  it("renders the top-level menus from editor.menu.*", async () => {
    renderDe();

    expect(await screen.findByText(de.editor.menu.file.label)).toBeInTheDocument();
    expect(screen.getByText(de.editor.menu.edit.label)).toBeInTheDocument();
    expect(screen.getByText(de.editor.menu.image.label)).toBeInTheDocument();
    expect(screen.getByText(de.editor.menu.layer.label)).toBeInTheDocument();
    expect(screen.getByText(de.editor.menu.select.label)).toBeInTheDocument();
    expect(screen.getByText(de.editor.menu.filter.label)).toBeInTheDocument();
    expect(screen.getByText(de.editor.menu.view.label)).toBeInTheDocument();
    expect(screen.queryByText("File")).not.toBeInTheDocument();
    expect(screen.queryByText("Layer")).not.toBeInTheDocument();
  });

  it("renders File menu items translated while their test ids stay English-derived", async () => {
    renderDe();

    fireEvent.click(await screen.findByText(de.editor.menu.file.label));

    expect(screen.getByTestId("menu-item-new")).toHaveTextContent(de.editor.menu.file.new);
    expect(screen.getByTestId("menu-item-export-as")).toHaveTextContent(
      de.editor.menu.file.exportAs,
    );
    expect(screen.getByTestId("menu-item-quick-export-as-png")).toHaveTextContent(
      de.editor.menu.file.quickExportPng,
    );
    expect(screen.queryByText("Open")).not.toBeInTheDocument();
    expect(screen.queryByText("Quick Export as PNG")).not.toBeInTheDocument();
  });

  it("renders View toggles and Layer items from their keys", async () => {
    renderDe();

    fireEvent.click(await screen.findByText(de.editor.menu.view.label));
    expect(screen.getByTestId("menu-item-fit-on-screen")).toHaveTextContent(
      de.editor.menu.view.fitOnScreen,
    );
    expect(screen.getByTestId("menu-item-rulers")).toHaveTextContent(de.editor.menu.view.rulers);

    fireEvent.click(screen.getByText(de.editor.menu.layer.label));
    expect(screen.getByTestId("menu-item-flatten-image")).toHaveTextContent(
      de.editor.menu.layer.flattenImage,
    );
    expect(screen.queryByText("Flatten Image")).not.toBeInTheDocument();
  });

  it("defines an item id for every menu-item test id the e2e suites select", () => {
    const repo = path.resolve(__dirname, "../../..");
    const menuSource = readFileSync(
      path.join(repo, "apps/web/src/components/editor/editor-menu-bar.tsx"),
      "utf8",
    );
    const ids = new Set([...menuSource.matchAll(/\bid: "([a-z0-9-]+)"/g)].map((m) => m[1]));
    const selected = new Set<string>();
    const scan = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) scan(full);
        else if (entry.name.endsWith(".ts")) {
          for (const m of readFileSync(full, "utf8").matchAll(/menu-item-([a-z0-9-]+)/g)) {
            selected.add(m[1]);
          }
        }
      }
    };
    scan(path.join(repo, "tests/e2e-editor"));
    scan(path.join(repo, "tests/e2e"));

    expect(selected.size).toBeGreaterThan(0);
    expect([...selected].filter((id) => !ids.has(id))).toEqual([]);
  });
});
