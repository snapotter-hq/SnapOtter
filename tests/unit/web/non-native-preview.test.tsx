// @vitest-environment jsdom

import { de } from "@snapotter/shared/i18n/de.js";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The jsdom env here has no working localStorage; the provider reads the
// stored locale choice from it, so give it a real in-memory one.
const storage = vi.hoisted(() => new Map<string, string>());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

import { NonNativePreview } from "@/components/common/non-native-preview";
import { I18nProvider } from "@/contexts/i18n-context";

// The en catalog matches the old hardcoded English lines byte for byte, so
// only a non-en render proves the rotating line comes from the catalog (#1269).
describe("NonNativePreview rotating progress line", () => {
  const messages = de.toolPage.previewProgressMessages;

  beforeEach(() => {
    storage.set("snapotter-locale", "de");
    // Only the rotation interval is faked; the provider loads `de` through
    // real promises and timeouts, which findByRole waits on.
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    // Keep the preview in its generating state for the whole test.
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
  });

  afterEach(() => {
    cleanup();
    storage.clear();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => void storage.set(k, v),
      removeItem: (k: string) => void storage.delete(k),
      clear: () => storage.clear(),
    });
  });

  async function startGenerating() {
    render(
      <I18nProvider>
        <NonNativePreview
          file={new File(["x"], "clip.mkv")}
          filename="clip.mkv"
          fileSize={1}
          modality="video"
        />
      </I18nProvider>,
    );
    fireEvent.click(await screen.findByRole("button", { name: de.toolPage.generatePreview }));
  }

  it("shows the first line from the active locale", async () => {
    await startGenerating();
    expect(screen.getByText(messages[0])).toBeTruthy();
    expect(screen.queryByText("Warming up the otter...")).toBeNull();
  });

  it("rotates through every line and wraps back to the first", async () => {
    await startGenerating();
    for (let i = 1; i <= messages.length; i++) {
      act(() => {
        vi.advanceTimersByTime(2500);
      });
      expect(screen.getByText(messages[i % messages.length])).toBeTruthy();
    }
  });
});
