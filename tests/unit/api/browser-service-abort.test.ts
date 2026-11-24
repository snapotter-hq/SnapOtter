/**
 * #5004: a canceled html-to-image job used to keep its Chromium page loading
 * for up to PAGE_LOAD_TIMEOUT plus NETWORK_IDLE_GRACE, holding a page and a
 * worker slot, because capturePage and captureHtml took no AbortSignal. The
 * capture now closes its page on abort and rejects with the signal's reason.
 */
import { realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const root = resolve(import.meta.dirname, "../../..");

// playwright is a dependency of apps/api only, so the bare specifier does not
// resolve from this file and a vi.doMock("playwright") would silently miss.
const playwrightEntry = resolve(
  dirname(
    realpathSync(createRequire(resolve(root, "apps/api/package.json")).resolve("playwright")),
  ),
  "index.mjs",
);

/** A page whose load never finishes on its own: only close() settles it. */
function makeHangingPage() {
  let rejectLoad: ((err: Error) => void) | undefined;
  const hang = () =>
    new Promise<never>((_resolve, reject) => {
      rejectLoad = reject;
    });
  const page = {
    closed: false,
    route: vi.fn(async () => {}),
    routeWebSocket: vi.fn(async () => {}),
    goto: vi.fn(hang),
    setContent: vi.fn(hang),
    waitForLoadState: vi.fn(async () => {}),
    evaluate: vi.fn(async () => 720),
    setViewportSize: vi.fn(async () => {}),
    screenshot: vi.fn(async () => Buffer.from("png")),
    close: vi.fn(async () => {
      page.closed = true;
      rejectLoad?.(new Error("page.goto: Target page, context or browser has been closed"));
    }),
  };
  return page;
}

function makeLoadingPage() {
  return {
    ...makeHangingPage(),
    goto: vi.fn(async () => null),
    setContent: vi.fn(async () => {}),
  };
}

// The service only sees what playwright hands it, so any page shape will do.
type FakePage = object;

let nextPage: () => FakePage | Promise<FakePage>;
let connected = true;
const newPage = vi.fn(async () => nextPage());

async function loadService() {
  vi.resetModules();
  vi.doMock(playwrightEntry, () => ({
    chromium: {
      executablePath: () => "/bin/sh",
      launch: vi.fn(async () => ({
        isConnected: () => connected,
        on: vi.fn(),
        newPage,
        close: vi.fn(async () => {}),
      })),
    },
  }));
  return import("../../../apps/api/src/lib/browser-service.js");
}

const options = {
  format: "png" as const,
  quality: 90,
  fullPage: false,
  viewportWidth: 1280,
  viewportHeight: 720,
};

beforeEach(() => {
  newPage.mockClear();
  nextPage = makeHangingPage;
  connected = true;
});

afterEach(() => {
  vi.doUnmock(playwrightEntry);
});

describe("browser-service capture honours an AbortSignal (#5004)", () => {
  it.each([
    ["capturePage", "goto"],
    ["captureHtml", "setContent"],
  ] as const)(
    "%s closes the loading page and rejects as soon as the job is canceled",
    async (fn, load) => {
      const service = await loadService();
      const page = makeHangingPage();
      nextPage = () => page;
      const ac = new AbortController();

      const capture = service[fn](fn === "capturePage" ? "https://example.com/" : "<p>slow</p>", {
        ...options,
        signal: ac.signal,
      });
      await vi.waitFor(() => expect(page[load]).toHaveBeenCalled());
      ac.abort();

      await expect(capture).rejects.toMatchObject({ name: "AbortError" });
      expect(page.close).toHaveBeenCalled();
      expect(page.screenshot).not.toHaveBeenCalled();
    },
  );

  it("rejects with the deadline's reason so the worker still records a timeout", async () => {
    const service = await loadService();
    const page = makeHangingPage();
    nextPage = () => page;
    const ac = new AbortController();

    const capture = service.capturePage("https://example.com/", { ...options, signal: ac.signal });
    await vi.waitFor(() => expect(page.goto).toHaveBeenCalled());
    ac.abort("timeout");

    await expect(capture).rejects.toBe("timeout");
    expect(page.close).toHaveBeenCalled();
  });

  it("never opens a page for a job canceled before its capture starts", async () => {
    const service = await loadService();
    const ac = new AbortController();
    ac.abort();

    await expect(
      service.captureHtml("<p>x</p>", { ...options, signal: ac.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(newPage).not.toHaveBeenCalled();
  });

  it("closes a page that opened after the cancel without loading it", async () => {
    const service = await loadService();
    const page = makeHangingPage();
    const ac = new AbortController();
    nextPage = () => {
      ac.abort();
      return page;
    };

    await expect(
      service.capturePage("https://example.com/", { ...options, signal: ac.signal }),
    ).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(page.close).toHaveBeenCalled());
    expect(page.goto).not.toHaveBeenCalled();
  });

  it("does not count canceled captures toward the crash window", async () => {
    const service = await loadService();
    for (let i = 0; i < 6; i++) {
      const page = makeHangingPage();
      nextPage = () => page;
      const ac = new AbortController();
      const capture = service.captureHtml("<p>x</p>", { ...options, signal: ac.signal });
      await vi.waitFor(() => expect(page.setContent).toHaveBeenCalled());
      ac.abort();
      await expect(capture).rejects.toMatchObject({ name: "AbortError" });
    }

    nextPage = makeLoadingPage;
    expect(service.isBrowserAvailable()).toBe(true);
    await expect(service.captureHtml("<p>x</p>", options)).resolves.toEqual(Buffer.from("png"));
  });

  it("still counts a capture that lost its browser toward the crash window", async () => {
    const service = await loadService();
    nextPage = () => ({
      ...makeLoadingPage(),
      setContent: vi.fn(async () => {
        connected = false;
        throw new Error("page.setContent: Browser has been closed");
      }),
    });

    await expect(
      service.captureHtml("<p>x</p>", { ...options, signal: new AbortController().signal }),
    ).rejects.toThrow("Browser has been closed");
    connected = true;
    await expect(service.captureHtml("<p>x</p>", options)).rejects.toThrow(
      "temporarily unavailable (backoff)",
    );
  });

  it("still captures normally with a signal that never aborts", async () => {
    const service = await loadService();
    const page = makeLoadingPage();
    nextPage = () => page;

    await expect(
      service.capturePage("https://example.com/", {
        ...options,
        signal: new AbortController().signal,
      }),
    ).resolves.toEqual(Buffer.from("png"));
    expect(page.close).toHaveBeenCalledTimes(1);
  });
});
