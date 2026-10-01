// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchShortcutHint } from "@/components/common/search-shortcut-hint";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));

function Harness() {
  useKeyboardShortcuts();
  return (
    <>
      <input data-search-input aria-label="search" />
      <button type="button">elsewhere</button>
      <SearchShortcutHint />
    </>
  );
}

function renderOn(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  expect(navigator.platform).toBe(platform);
  render(
    <MemoryRouter>
      <Harness />
    </MemoryRouter>,
  );
  const elsewhere = screen.getByRole("button", { name: "elsewhere" });
  elsewhere.focus();
  return { search: screen.getByLabelText("search"), elsewhere };
}

function pressK(mods: { ctrlKey?: boolean; metaKey?: boolean }) {
  window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", bubbles: true, ...mods }));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The hint and the handler both read isApplePlatform(); these pin that the key
// the hint names is the key that works, and that the other modifier doesn't.
describe("focus-search shortcut agrees with its hint", () => {
  it.each(["Win32", "Linux x86_64"])("on %s: hint says Ctrl+K and only Ctrl+K works", (p) => {
    const { search, elsewhere } = renderOn(p);
    expect(screen.getByTestId("search-shortcut-hint").textContent).toBe("Ctrl+K");

    pressK({ metaKey: true });
    expect(document.activeElement).toBe(elsewhere);

    pressK({ ctrlKey: true });
    expect(document.activeElement).toBe(search);
  });

  it("on MacIntel: hint says the Cmd glyph and only Cmd+K works", () => {
    const { search, elsewhere } = renderOn("MacIntel");
    expect(screen.getByTestId("search-shortcut-hint").textContent).toBe("⌘K");

    pressK({ ctrlKey: true });
    expect(document.activeElement).toBe(elsewhere);

    pressK({ metaKey: true });
    expect(document.activeElement).toBe(search);
  });
});
