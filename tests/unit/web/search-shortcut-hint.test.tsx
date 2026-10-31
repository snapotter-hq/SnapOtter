// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SearchShortcutHint } from "@/components/common/search-shortcut-hint";
import { formatShortcut } from "@/hooks/use-keyboard-shortcuts";

function onPlatform(platform: string) {
  vi.spyOn(navigator, "platform", "get").mockReturnValue(platform);
  // jsdom's own platform is "", which already reads as non-Apple: without this
  // check a spy that silently failed would leave the Ctrl cases passing.
  expect(navigator.platform).toBe(platform);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SearchShortcutHint", () => {
  it.each(["Win32", "Linux x86_64"])("shows Ctrl+K on %s, where the handler wants Ctrl", (p) => {
    onPlatform(p);
    render(<SearchShortcutHint />);
    const hint = screen.getByTestId("search-shortcut-hint");
    expect(hint.textContent).toBe("Ctrl+K");
  });

  it.each(["MacIntel", "iPad"])("shows the Cmd glyph on %s, where the handler wants Cmd", (p) => {
    onPlatform(p);
    render(<SearchShortcutHint />);
    expect(screen.getByTestId("search-shortcut-hint").textContent).toBe("⌘K");
  });
});

describe("formatShortcut", () => {
  it("spells mod as Ctrl, joined with +, off Apple platforms", () => {
    onPlatform("Win32");
    expect(formatShortcut("mod+k")).toBe("Ctrl+K");
    expect(formatShortcut("mod+shift+d")).toBe("Ctrl+Shift+D");
    expect(formatShortcut("mod+alt+1")).toBe("Ctrl+Alt+1");
  });

  it("spells mod with the Apple modifier glyphs on Apple platforms", () => {
    onPlatform("MacIntel");
    expect(formatShortcut("mod+k")).toBe("⌘K");
    expect(formatShortcut("mod+shift+d")).toBe("⌘⇧D");
    expect(formatShortcut("mod+alt+1")).toBe("⌘⌥1");
  });
});
