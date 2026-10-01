// @vitest-environment jsdom

import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { NonNativePreview } from "@/components/common/non-native-preview";
import { captureHandledError } from "@/lib/analytics";

const clip = (name: string) => (
  <NonNativePreview file={new File(["x"], name)} filename={name} fileSize={1} modality="video" />
);

function reported(): { message: string; statusCode: unknown; tags: unknown }[] {
  return vi.mocked(captureHandledError).mock.calls.map(([error, tags]) => ({
    message: (error as Error).message,
    statusCode: (error as { statusCode?: unknown }).statusCode,
    tags,
  }));
}

// #1280: every failed preview used to land in the same "Preview generation
// failed" state with nothing logged, so an upload over the size limit looked
// like a broken file and a server fault left no trace.
describe("NonNativePreview failure states", () => {
  beforeEach(() => {
    vi.mocked(captureHandledError).mockClear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  function generateWith(fetchImpl: () => Promise<Response>) {
    vi.stubGlobal("fetch", vi.fn(fetchImpl));
    const view = render(clip("clip.mkv"));
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.generatePreview }));
    return view;
  }

  it("says the file is too large on a 413, and doesn't report it", async () => {
    generateWith(async () => new Response(JSON.stringify({ error: "x" }), { status: 413 }));

    expect(await screen.findByText(en.errors.fileTooLarge)).toBeTruthy();
    expect(screen.queryByText(en.toolPage.previewFailed)).toBeNull();
    // The same file hits the same limit, so no Retry.
    expect(screen.queryByRole("button", { name: en.common.retry })).toBeNull();
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("reports a server fault with its status, and keeps Retry", async () => {
    generateWith(async () => new Response("", { status: 502 }));

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(screen.getByRole("button", { name: en.common.retry })).toBeTruthy();
    // Sentry's scrubber keeps the message and only allowlisted tags. The
    // message is constant; captureHandledError tags the statusCode (#1351).
    expect(reported()).toEqual([
      {
        message: "Media preview generation failed",
        statusCode: 502,
        tags: { error_class: "operational" },
      },
    ]);
  });

  it("reports a rate limit, which isn't about the file", async () => {
    generateWith(async () => new Response("", { status: 429 }));

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(reported().map(({ message, statusCode }) => ({ message, statusCode }))).toEqual([
      { message: "Media preview generation failed", statusCode: 429 },
    ]);
  });

  it("reports a failed request with its cause attached", async () => {
    const networkError = new TypeError("Failed to fetch");
    generateWith(async () => {
      throw networkError;
    });

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [error] = vi.mocked(captureHandledError).mock.calls[0];
    expect((error as Error).message).toBe("Media preview request failed");
    expect((error as Error).cause).toBe(networkError);
  });

  it("doesn't report an undecodable file (422)", async () => {
    generateWith(async () => new Response("", { status: 422 }));

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("resets to idle when the input changes after a 413", async () => {
    const view = generateWith(
      async () => new Response(JSON.stringify({ error: "x" }), { status: 413 }),
    );
    expect(await screen.findByText(en.errors.fileTooLarge)).toBeTruthy();

    // The call sites don't remount per file, so the next file arrives as a
    // prop change and must not inherit the last file's dead end.
    view.rerender(clip("other.mkv"));

    expect(screen.queryByText(en.errors.fileTooLarge)).toBeNull();
    expect(screen.getByRole("button", { name: en.toolPage.generatePreview })).toBeTruthy();
    expect(screen.getByText("other.mkv")).toBeTruthy();
  });

  it("drops a late response for the previous file", async () => {
    let resolveOld: (r: Response) => void = () => {};
    const view = generateWith(
      () =>
        new Promise<Response>((resolve, reject) => {
          resolveOld = resolve;
          // Honour the abort the way fetch does.
          const init = vi.mocked(fetch).mock.calls[0]?.[1] as RequestInit | undefined;
          init?.signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "AbortError")),
          );
        }),
    );

    view.rerender(clip("other.mkv"));
    await act(async () => {
      resolveOld(new Response("", { status: 500 }));
    });

    expect(screen.getByRole("button", { name: en.toolPage.generatePreview })).toBeTruthy();
    expect(screen.queryByText(en.toolPage.previewFailed)).toBeNull();
    expect(captureHandledError).not.toHaveBeenCalled();
  });
});
