// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { ImageToBase64Settings } from "@/components/tools/image-to-base64-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useBase64Store } from "@/stores/base64-store";
import { useFileStore } from "@/stores/file-store";

/**
 * Each response is stamped with the entry it was encoded from, so the results
 * panel can tell apart two files that share a name (#1701). The server never
 * sees the entry id; it answers by filename only.
 */

function serverResult(filename: string, base64: string) {
  return {
    filename,
    mimeType: "image/png",
    width: 1,
    height: 1,
    originalSize: 10,
    encodedSize: 14,
    overheadPercent: 40,
    base64,
    dataUri: `data:image/png;base64,${base64}`,
  };
}

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

const ENCODE_URL = "/api/v1/tools/image/image-to-base64";

/**
 * Answers the encode requests in turn and anything else the providers fetch on
 * mount with an empty body, so only encode calls use up the queued answers.
 */
function encodeServer(...answers: Array<() => Promise<Response>>) {
  const encode = vi.fn();
  for (const answer of answers) encode.mockImplementationOnce(answer);
  const fetchMock = vi.fn((input: RequestInfo | URL) =>
    String(input).endsWith(ENCODE_URL) ? encode() : respond({}),
  );
  return { fetchMock, encode };
}

beforeEach(() => {
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  useFileStore.getState().reset();
  useBase64Store.getState().reset();
  useFileStore
    .getState()
    .setFiles([
      new File(["a"], "image.png", { type: "image/png" }),
      new File(["b"], "image.png", { type: "image/png" }),
      new File(["c"], "image.png", { type: "image/png" }),
    ]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("image-to-base64 settings", () => {
  it("stamps every result and error with the entry it came from", async () => {
    const { fetchMock, encode } = encodeServer(
      () => respond({ results: [serverResult("image.png", "Zmlyc3Q=")], errors: [] }),
      () => respond({ results: [], errors: [{ filename: "image.png", error: "Unsupported" }] }),
      () => respond({ error: "Too big" }, 413),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [first, second, third] = useFileStore.getState().entries;

    const { getByTestId } = render(
      <I18nProvider>
        <ImageToBase64Settings />
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("base64-submit"));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(useBase64Store.getState().processing).toBe(false));

    const { results, errors } = useBase64Store.getState();
    expect(results).toEqual([expect.objectContaining({ entryId: first.id, base64: "Zmlyc3Q=" })]);
    expect(errors).toEqual([
      expect.objectContaining({ entryId: second.id, error: "Unsupported" }),
      expect.objectContaining({ entryId: third.id, error: "Too big" }),
    ]);
  });

  it("stamps a failed request with the entry it was for", async () => {
    const fail = () => Promise.reject(new TypeError("Failed to fetch"));
    const { fetchMock, encode } = encodeServer(fail, fail, fail);
    vi.stubGlobal("fetch", fetchMock);
    const ids = useFileStore.getState().entries.map((e) => e.id);

    const { getByTestId } = render(
      <I18nProvider>
        <ImageToBase64Settings />
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("base64-submit"));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(useBase64Store.getState().processing).toBe(false));

    expect(useBase64Store.getState().errors.map((e) => e.entryId)).toEqual(ids);
  });
});
