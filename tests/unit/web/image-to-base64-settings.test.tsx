// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
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
      // A 413 reads as the translated size message, not the body (#1916).
      expect.objectContaining({ entryId: third.id, error: en.errors.fileTooLarge }),
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

  it("skips a queued file that was removed while an earlier file was in flight (#1718)", async () => {
    let resolveFirst: (res: Response) => void = () => {};
    const { fetchMock, encode } = encodeServer(
      () =>
        new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        }),
      () => respond({ results: [serverResult("image.png", "dGhpcmQ=")], errors: [] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [first, , third] = useFileStore.getState().entries;

    const { getByTestId } = render(
      <I18nProvider>
        <ImageToBase64Settings />
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("base64-submit"));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(1));

    // Remove the second file before its request starts.
    act(() => {
      useFileStore.getState().removeFile(1);
    });

    await act(async () => {
      resolveFirst(
        new Response(
          JSON.stringify({ results: [serverResult("image.png", "Zmlyc3Q=")], errors: [] }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => expect(useBase64Store.getState().processing).toBe(false));

    expect(encode).toHaveBeenCalledTimes(2);
    expect(useBase64Store.getState().results.map((r) => r.entryId)).toEqual([first.id, third.id]);
  });

  it("aborts and continues with remaining files when the in-flight file is removed and fetch rejects with AbortError (#1718)", async () => {
    let firstSignal: AbortSignal | undefined;
    const encode = vi
      .fn()
      .mockImplementationOnce((init?: RequestInit) => {
        firstSignal = init?.signal ?? undefined;
        return new Promise<Response>((_resolve, reject) => {
          firstSignal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        });
      })
      .mockImplementationOnce(() =>
        respond({ results: [serverResult("image.png", "c2Vjb25k")], errors: [] }),
      )
      .mockImplementationOnce(() =>
        respond({ results: [serverResult("image.png", "dGhpcmQ=")], errors: [] }),
      );
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith(ENCODE_URL) ? encode(init) : respond({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [, second, third] = useFileStore.getState().entries;

    const { getByTestId } = render(
      <I18nProvider>
        <ImageToBase64Settings />
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("base64-submit"));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(1));

    act(() => {
      useFileStore.getState().removeFile(0);
    });
    expect(firstSignal?.aborted).toBe(true);

    await waitFor(() => expect(useBase64Store.getState().processing).toBe(false));

    expect(encode).toHaveBeenCalledTimes(3);
    expect(useBase64Store.getState().results.map((r) => r.entryId)).toEqual([second.id, third.id]);
    expect(useBase64Store.getState().errors).toEqual([]);
  });

  it("drops a late response for a file that was removed mid-request and continues with remaining files (#1718)", async () => {
    let resolveFirst: (res: Response) => void = () => {};
    let firstSignal: AbortSignal | undefined;
    const encode = vi
      .fn()
      .mockImplementationOnce((init?: RequestInit) => {
        firstSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveFirst = resolve;
        });
      })
      .mockImplementationOnce(() =>
        respond({ results: [serverResult("image.png", "c2Vjb25k")], errors: [] }),
      )
      .mockImplementationOnce(() =>
        respond({ results: [serverResult("image.png", "dGhpcmQ=")], errors: [] }),
      );
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith(ENCODE_URL) ? encode(init) : respond({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [, second, third] = useFileStore.getState().entries;

    const { getByTestId } = render(
      <I18nProvider>
        <ImageToBase64Settings />
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("base64-submit"));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(1));

    // Remove the first file while its request is in flight, then resolve its response anyway.
    act(() => {
      useFileStore.getState().removeFile(0);
    });
    expect(firstSignal?.aborted).toBe(true);
    await act(async () => {
      resolveFirst(
        new Response(
          JSON.stringify({ results: [serverResult("image.png", "Zmlyc3Q=")], errors: [] }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => expect(useBase64Store.getState().processing).toBe(false));

    expect(encode).toHaveBeenCalledTimes(3);
    expect(useBase64Store.getState().results.map((r) => r.entryId)).toEqual([second.id, third.id]);
  });

  it("prunes an already-encoded file when it is removed while a later file is in flight without aborting the active request (#1718)", async () => {
    let resolveSecond: (res: Response) => void = () => {};
    let secondSignal: AbortSignal | undefined;
    const encode = vi
      .fn()
      .mockImplementationOnce(() =>
        respond({ results: [serverResult("image.png", "Zmlyc3Q=")], errors: [] }),
      )
      .mockImplementationOnce((init?: RequestInit) => {
        secondSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        });
      })
      .mockImplementationOnce(() =>
        respond({ results: [serverResult("image.png", "dGhpcmQ=")], errors: [] }),
      );
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith(ENCODE_URL) ? encode(init) : respond({}),
    );
    vi.stubGlobal("fetch", fetchMock);
    const [first, second, third] = useFileStore.getState().entries;

    const { getByTestId } = render(
      <I18nProvider>
        <ImageToBase64Settings />
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("base64-submit"));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(2));
    expect(useBase64Store.getState().results.map((r) => r.entryId)).toEqual([first.id]);

    // Remove the first (already completed) file while the second file is in flight.
    act(() => {
      useFileStore.getState().removeFile(0);
    });
    expect(useBase64Store.getState().results).toEqual([]);
    expect(secondSignal?.aborted).toBe(false);

    await act(async () => {
      resolveSecond(
        new Response(
          JSON.stringify({ results: [serverResult("image.png", "c2Vjb25k")], errors: [] }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => expect(useBase64Store.getState().processing).toBe(false));

    expect(encode).toHaveBeenCalledTimes(3);
    expect(useBase64Store.getState().results.map((r) => r.entryId)).toEqual([second.id, third.id]);
  });

  it("aborts the active run and clears partial results when a new file is added mid-run (#1718)", async () => {
    let resolveSecond: (res: Response) => void = () => {};
    let secondSignal: AbortSignal | undefined;
    const encode = vi
      .fn()
      .mockImplementationOnce(() =>
        respond({ results: [serverResult("image.png", "Zmlyc3Q=")], errors: [] }),
      )
      .mockImplementationOnce((init?: RequestInit) => {
        secondSignal = init?.signal ?? undefined;
        return new Promise<Response>((resolve) => {
          resolveSecond = resolve;
        });
      });
    const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith(ENCODE_URL) ? encode(init) : respond({}),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { getByTestId } = render(
      <I18nProvider>
        <ImageToBase64Settings />
      </I18nProvider>,
    );
    fireEvent.click(getByTestId("base64-submit"));
    await waitFor(() => expect(encode).toHaveBeenCalledTimes(2));
    expect(useBase64Store.getState().results).toHaveLength(1);

    act(() => {
      useFileStore.getState().addFiles([new File(["d"], "d.png", { type: "image/png" })]);
    });

    expect(secondSignal?.aborted).toBe(true);
    expect(useBase64Store.getState().processing).toBe(false);
    expect(useBase64Store.getState().results).toEqual([]);

    await act(async () => {
      resolveSecond(
        new Response(
          JSON.stringify({ results: [serverResult("image.png", "c2Vjb25k")], errors: [] }),
          { status: 200 },
        ),
      );
    });

    expect(encode).toHaveBeenCalledTimes(2);
    expect(useBase64Store.getState().results).toEqual([]);
    expect(useBase64Store.getState().processing).toBe(false);
  });
});
