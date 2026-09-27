// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  // formatHeaders() in @/lib/api reads this.
  getDistinctId: () => null,
  captureHandledError: vi.fn(() => Promise.resolve(null)),
}));

import { NonNativePreview } from "@/components/common/non-native-preview";

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
  render(
    <NonNativePreview src={SOURCE_URL} filename="clip.mkv" fileSize={null} modality="video" />,
  );
  fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
  await act(async () => {});
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

    expect(previewCalls(fetchMock)).toHaveLength(0);
    expect(screen.getByText("Preview generation failed")).toBeTruthy();
  });

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
