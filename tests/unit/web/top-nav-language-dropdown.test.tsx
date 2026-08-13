// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopNav } from "@/components/layout/top-nav";

// Same minimal stub as tool-feedback-prompt.test.tsx: this jsdom setup ships
// no working localStorage, and TopNav's theme/locale hooks read it on render.
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  storageMap.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderNav() {
  return render(
    <MemoryRouter>
      <TopNav onHelpClick={() => {}} onFeedbackClick={() => {}} onSettingsClick={() => {}} />
    </MemoryRouter>,
  );
}

/**
 * The click-outside listener must be pointerdown, not mousedown: iOS Safari
 * fires no mouse events for taps on non-interactive page area, so a mousedown
 * listener leaves the dropdown stuck open on touch devices. jsdom will not
 * synthesize mousedown from pointerdown, so a revert fails this test.
 */
describe("TopNav language dropdown", () => {
  it("closes on pointerdown outside", () => {
    renderNav();
    fireEvent.click(screen.getByTitle("Language"));
    expect(screen.getByText("Deutsch")).toBeDefined();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByText("Deutsch")).toBeNull();
  });

  it("stays open on pointerdown inside the dropdown", () => {
    renderNav();
    fireEvent.click(screen.getByTitle("Language"));

    fireEvent.pointerDown(screen.getByText("Deutsch"));
    expect(screen.getByText("Deutsch")).toBeDefined();
  });
});
