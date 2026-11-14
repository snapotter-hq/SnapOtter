// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useKeyboardShortcuts } from "@/hooks/use-keyboard-shortcuts";

vi.mock("@/hooks/use-theme", () => ({ useTheme: () => ({ toggleTheme: vi.fn() }) }));

function Harness({ download }: { download?: () => void }) {
  useKeyboardShortcuts();
  return (
    <>
      <button type="button">elsewhere</button>
      {download && (
        <button type="button" data-download-button onClick={download}>
          download
        </button>
      )}
    </>
  );
}

function pressCtrlS(target: HTMLElement): KeyboardEvent {
  const e = new KeyboardEvent("keydown", {
    key: "s",
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
  });
  target.dispatchEvent(e);
  return e;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// The editor binds its own Ctrl+S (save the editor state) on document. The
// global Download-result shortcut listens on window in the capture phase, so
// it must let the key through when the page has nothing to download.
describe("global Ctrl+S", () => {
  it("lets the key reach a page's own Ctrl+S when there's no result to download", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    render(
      <MemoryRouter>
        <Harness />
      </MemoryRouter>,
    );
    const pageSave = vi.fn();
    document.addEventListener("keydown", pageSave);
    try {
      const e = pressCtrlS(screen.getByRole("button", { name: "elsewhere" }));
      expect(pageSave).toHaveBeenCalledTimes(1);
      // The browser's own "Save page" still never opens.
      expect(e.defaultPrevented).toBe(true);
    } finally {
      document.removeEventListener("keydown", pageSave);
    }
  });

  it("downloads the result when there is one", () => {
    vi.spyOn(navigator, "platform", "get").mockReturnValue("Linux x86_64");
    const download = vi.fn();
    render(
      <MemoryRouter>
        <Harness download={download} />
      </MemoryRouter>,
    );
    const e = pressCtrlS(screen.getByRole("button", { name: "elsewhere" }));
    expect(download).toHaveBeenCalledTimes(1);
    expect(e.defaultPrevented).toBe(true);
  });
});
