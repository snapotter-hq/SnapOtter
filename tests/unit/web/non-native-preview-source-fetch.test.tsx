// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  // formatHeaders() in @/lib/api reads this.
  getDistinctId: () => null,
  captureHandledError: vi.fn(() => Promise.resolve(null)),
}));

import { NonNativePreview } from "@/components/common/non-native-preview";
import { captureHandledError } from "@/lib/analytics";

const SOURCE_URL = "/api/v1/download/job-1/clip.mkv";
const PREVIEW_URL = "/api/v1/preview/generate";

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:preview",
    revokeObjectURL: () => {},
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubFetch(source: () => Promise<unknown>) {
  const fetchMock = vi.fn((input: string) =>
    input === SOURCE_URL
      ? source()
      : Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob(["mp4"], { type: "video/mp4" })),
        }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function previewCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(PREVIEW_URL));
}

async function generate() {
  const view = render(
    <NonNativePreview src={SOURCE_URL} filename="clip.mkv" fileSize={null} modality="video" />,
  );
  fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
  await act(async () => {});
  return view;
}

// #1286: a failed source fetch used to send the error body off to be
// transcoded, as if it were the user's media.
describe("NonNativePreview source fetch (#1286)", () => {
  it("does not send an error page to the preview endpoint when the source fetch fails", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: false,
        status: 404,
        blob: () => Promise.resolve(new Blob(['{"error":"File not found"}'])),
      }),
    );

    await generate();

    expect(fetchMock.mock.calls.filter(([url]) => url === SOURCE_URL)).toHaveLength(1);
    expect(previewCalls(fetchMock)).toHaveLength(0);
    expect(screen.getByText(en.toolPage.resultExpired)).toBeTruthy();
  });

  // #1350: the preview never ran, so "Preview generation failed" was wrong,
  // and Retry would only fetch the same missing result again.
  it.each([404, 410])(
    "says the result has expired on a %i source fetch, and offers no retry",
    async (status) => {
      stubFetch(() =>
        Promise.resolve({ ok: false, status, blob: () => Promise.resolve(new Blob()) }),
      );

      await generate();

      expect(screen.getByText(en.toolPage.resultExpired)).toBeTruthy();
      expect(screen.queryByText(en.toolPage.previewFailed)).toBeNull();
      expect(screen.queryByRole("button", { name: en.common.retry })).toBeNull();
    },
  );

  it("keeps the generic failure and Retry when the source fetch fails another way", async () => {
    stubFetch(() =>
      Promise.resolve({ ok: false, status: 502, blob: () => Promise.resolve(new Blob()) }),
    );

    await generate();

    expect(screen.getByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(screen.queryByText(en.toolPage.resultExpired)).toBeNull();
    expect(screen.getByRole("button", { name: en.common.retry })).toBeTruthy();
  });

  // Only the source fetch's 404 means the result is gone. The preview
  // endpoint's own 404 is a different fault and keeps Retry.
  it("keeps the generic failure and Retry on a 404 from the preview request", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) =>
        Promise.resolve(
          input === SOURCE_URL
            ? new Response(new Blob(["mkv"]), { status: 200 })
            : new Response("{}", { status: 404 }),
        ),
      ),
    );

    await generate();

    expect(await screen.findByText(en.toolPage.previewFailed)).toBeTruthy();
    expect(screen.queryByText(en.toolPage.resultExpired)).toBeNull();
    expect(screen.getByRole("button", { name: en.common.retry })).toBeTruthy();
  });

  it("forgets an expired source when it is handed a different file", async () => {
    stubFetch(() =>
      Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }),
    );

    const view = await generate();
    expect(screen.getByText(en.toolPage.resultExpired)).toBeTruthy();

    view.rerender(
      <NonNativePreview
        src="/api/v1/download/job-2/other.mkv"
        filename="other.mkv"
        fileSize={null}
        modality="video"
      />,
    );

    expect(screen.queryByText(en.toolPage.resultExpired)).toBeNull();
    expect(screen.getByRole("button", { name: en.toolPage.generatePreview })).toBeTruthy();
  });

  // #1351: the message stays constant and the status goes on as a tag. The
  // error itself still carries no statusCode, so a source fetch's status can't
  // be mistaken for the preview request's (a 413 there means "too large").
  it.each([404, 502])(
    "reports a %i source fetch with a constant message and the status as a tag",
    async (status) => {
      vi.mocked(captureHandledError).mockClear();
      stubFetch(() =>
        Promise.resolve({ ok: false, status, blob: () => Promise.resolve(new Blob()) }),
      );

      await generate();

      expect(captureHandledError).toHaveBeenCalledTimes(1);
      const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
      expect(error.message).toBe("Media preview could not fetch its source");
      expect((error as { statusCode?: unknown }).statusCode).toBeUndefined();
      expect(tags).toEqual({ error_class: "operational", status_code: String(status) });
    },
  );

  it("still sends a source that fetched fine", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(new Blob(["mkv"], { type: "video/x-matroska" })),
      }),
    );

    await generate();

    expect(previewCalls(fetchMock)).toHaveLength(1);
    expect(screen.queryByText("Preview generation failed")).toBeNull();
  });
});
