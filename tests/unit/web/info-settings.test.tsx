// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { InfoSettings } from "@/components/tools/info-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFileStore } from "@/stores/file-store";

function makeInfo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    filename: "a.png",
    fileSize: 2048,
    width: 800,
    height: 600,
    format: "png",
    channels: 4,
    hasAlpha: true,
    colorSpace: "srgb",
    density: 72,
    isProgressive: false,
    orientation: null,
    hasProfile: false,
    hasExif: false,
    hasIcc: false,
    hasXmp: false,
    bitDepth: "uchar",
    pages: 1,
    histogram: [
      { channel: "red", min: 0, max: 255, mean: 128, stdev: 40 },
      { channel: "green", min: 10, max: 240, mean: 120, stdev: 35 },
      { channel: "blue", min: 5, max: 250, mean: 110, stdev: 38 },
      { channel: "alpha", min: 255, max: 255, mean: 255, stdev: 0 },
    ],
    ...overrides,
  };
}

function imageFile(name: string, type = "image/png", content = name) {
  return new File([content], name, { type });
}

const INFO_URL = "/api/v1/tools/image/info";

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:fake"),
    revokeObjectURL: vi.fn(),
  });
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("InfoSettings (#2688)", () => {
  it("clears previous metadata and fetches the new file when a single file replaces another", async () => {
    const uploadedNames: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith(INFO_URL)) {
          return new Response("{}", { status: 200 });
        }
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        uploadedNames.push(file.name);
        if (file.name === "a.png") {
          return new Response(
            JSON.stringify(makeInfo({ filename: "a.png", width: 800, height: 600, format: "png" })),
            { status: 200 },
          );
        }
        return new Response(
          JSON.stringify(
            makeInfo({
              filename: "b.jpg",
              width: 1920,
              height: 1080,
              format: "jpeg",
              hasAlpha: false,
              density: null,
              isProgressive: true,
              hasIcc: true,
              hasExif: true,
              hasXmp: true,
              histogram: [{ channel: "gray", min: 0, max: 255, mean: 100, stdev: 20 }],
            }),
          ),
          { status: 200 },
        );
      }),
    );

    useFileStore.getState().setFiles([imageFile("a.png", "image/png")]);
    render(
      <I18nProvider>
        <InfoSettings />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId("info-submit"));
    await waitFor(() => expect(screen.getByText("800 x 600")).toBeInTheDocument());
    expect(screen.getByText("png")).toBeInTheDocument();
    expect(uploadedNames).toEqual(["a.png"]);

    // Drop a single replacement file (`files.length` stays 1).
    act(() => {
      useFileStore.getState().setFiles([imageFile("b.jpg", "image/jpeg")]);
    });

    expect(screen.queryByText("800 x 600")).not.toBeInTheDocument();
    expect(screen.queryByText("png")).not.toBeInTheDocument();

    // Clicking Get Image Info inspects b.jpg rather than re-serving a.png from index 0.
    fireEvent.click(screen.getByTestId("info-submit"));
    await waitFor(() => expect(screen.getByText("1920 x 1080")).toBeInTheDocument());
    expect(screen.getByText("jpeg")).toBeInTheDocument();
    expect(uploadedNames).toEqual(["a.png", "b.jpg"]);
  });

  it("does not overwrite the newly selected file's panel state when an earlier file's fetch resolves late", async () => {
    const pending: Array<{
      file: File;
      signal?: AbortSignal;
      resolve: (res: Response) => void;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith(INFO_URL)) {
          return Promise.resolve(new Response("{}", { status: 200 }));
        }
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        return new Promise<Response>((resolve) => {
          pending.push({ file, signal: init?.signal ?? undefined, resolve });
        });
      }),
    );

    useFileStore
      .getState()
      .setFiles([imageFile("a.png", "image/png"), imageFile("b.jpg", "image/jpeg")]);
    render(
      <I18nProvider>
        <InfoSettings />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId("info-submit"));
    expect(pending).toHaveLength(1);
    expect(pending[0].file.name).toBe("a.png");

    // Switch to b.jpg while a.png's request is still in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(pending).toHaveLength(2);
    expect(pending[1].file.name).toBe("b.jpg");

    // Even if a.png's request resolves before b.jpg's, it must not display under b.jpg.
    await act(async () => {
      pending[0].resolve(
        new Response(
          JSON.stringify(makeInfo({ filename: "a.png", width: 800, height: 600, format: "png" })),
          { status: 200 },
        ),
      );
    });
    expect(screen.queryByText("800 x 600")).not.toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(true);

    // Resolve b.jpg and verify b.jpg's metadata displays.
    await act(async () => {
      pending[1].resolve(
        new Response(
          JSON.stringify(
            makeInfo({ filename: "b.jpg", width: 1920, height: 1080, format: "jpeg" }),
          ),
          { status: 200 },
        ),
      );
    });
    await waitFor(() => expect(screen.getByText("1920 x 1080")).toBeInTheDocument());
    expect(useFileStore.getState().processing).toBe(false);

    // Switching back to a.png serves its cached entry without another network request.
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });
    expect(screen.getByText("800 x 600")).toBeInTheDocument();
    expect(pending).toHaveLength(2);
  });

  it("aborts an in-flight fetch and ignores its late response when the file is replaced", async () => {
    const pending: Array<{
      file: File;
      signal?: AbortSignal;
      resolve: (res: Response) => void;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith(INFO_URL)) {
          return Promise.resolve(new Response("{}", { status: 200 }));
        }
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        return new Promise<Response>((resolve) => {
          pending.push({ file, signal: init?.signal ?? undefined, resolve });
        });
      }),
    );

    useFileStore.getState().setFiles([imageFile("a.png", "image/png")]);
    render(
      <I18nProvider>
        <InfoSettings />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId("info-submit"));
    expect(pending).toHaveLength(1);
    expect(useFileStore.getState().processing).toBe(true);

    // Replace a.png with b.jpg while a.png is in flight.
    act(() => {
      useFileStore.getState().setFiles([imageFile("b.jpg", "image/jpeg")]);
    });

    expect(pending[0].signal?.aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);

    // Late resolution of a.png must not populate state or cache for b.jpg.
    await act(async () => {
      pending[0].resolve(
        new Response(
          JSON.stringify(makeInfo({ filename: "a.png", width: 800, height: 600, format: "png" })),
          { status: 200 },
        ),
      );
    });
    expect(screen.queryByText("800 x 600")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("info-submit"));
    expect(pending).toHaveLength(2);
    expect(pending[1].file.name).toBe("b.jpg");
  });

  it("aborts an in-flight fetch when switching back to an already-cached file", async () => {
    const pending: Array<{
      file: File;
      signal?: AbortSignal;
      resolve: (res: Response) => void;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith(INFO_URL)) {
          return Promise.resolve(new Response("{}", { status: 200 }));
        }
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        return new Promise<Response>((resolve) => {
          pending.push({ file, signal: init?.signal ?? undefined, resolve });
        });
      }),
    );

    useFileStore
      .getState()
      .setFiles([imageFile("a.png", "image/png"), imageFile("b.jpg", "image/jpeg")]);
    render(
      <I18nProvider>
        <InfoSettings />
      </I18nProvider>,
    );

    // Fetch a.png and let it complete so it is cached.
    fireEvent.click(screen.getByTestId("info-submit"));
    expect(pending).toHaveLength(1);
    await act(async () => {
      pending[0].resolve(
        new Response(
          JSON.stringify(makeInfo({ filename: "a.png", width: 800, height: 600, format: "png" })),
          { status: 200 },
        ),
      );
    });
    expect(screen.getByText("800 x 600")).toBeInTheDocument();

    // Switch to b.jpg -> starts fetch #2 for b.jpg.
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(pending).toHaveLength(2);
    expect(useFileStore.getState().processing).toBe(true);
    expect(screen.queryByText("800 x 600")).not.toBeInTheDocument();

    // Switch back to cached a.png while b.jpg is still in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });
    expect(pending[1].signal?.aborted).toBe(true);
    expect(useFileStore.getState().processing).toBe(false);
    expect(screen.getByText("800 x 600")).toBeInTheDocument();

    // If b.jpg's fetch resolves or fails late, a.png stays displayed without error.
    await act(async () => {
      pending[1].resolve(new Response(JSON.stringify({ error: "Late failure" }), { status: 500 }));
    });
    expect(screen.getByText("800 x 600")).toBeInTheDocument();
    expect(useFileStore.getState().error).toBeNull();

    // Re-clicking Get Image Info for a.png serves from cacheRef without another request.
    fireEvent.click(screen.getByTestId("info-submit"));
    expect(pending).toHaveLength(2);
    expect(screen.getByText("800 x 600")).toBeInTheDocument();
  });

  it("guards setInfo and setError by entryId when selectedIndex changes in the same tick as fetch settles, and clears error on addFiles", async () => {
    const pending: Array<{
      file: File;
      resolve: (res: Response) => void;
      reject: (err: unknown) => void;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
        if (!String(input).endsWith(INFO_URL)) {
          return Promise.resolve(new Response("{}", { status: 200 }));
        }
        const form = init?.body as FormData;
        const file = form.get("file") as File;
        return new Promise<Response>((resolve, reject) => {
          pending.push({ file, resolve, reject });
        });
      }),
    );

    useFileStore
      .getState()
      .setFiles([imageFile("a.png", "image/png"), imageFile("b.jpg", "image/jpeg")]);
    render(
      <I18nProvider>
        <InfoSettings />
      </I18nProvider>,
    );

    // Start a.png fetch, then in a single synchronous turn before passive effects run,
    // reject a.png and switch selectedIndex to 1: the entryId guard suppresses the error.
    fireEvent.click(screen.getByTestId("info-submit"));
    expect(pending).toHaveLength(1);
    await act(async () => {
      pending[0].reject(new Error("a.png network failure"));
      useFileStore.getState().setSelectedIndex(1);
      await Promise.resolve();
    });

    expect(useFileStore.getState().error).toBeNull();
    expect(pending).toHaveLength(2);

    // Now let b.jpg fail while b.jpg IS still selected -> error is set, then addFiles clears it.
    await act(async () => {
      pending[1].reject(new Error("b.jpg network failure"));
    });
    expect(useFileStore.getState().error).toBe("b.jpg network failure");

    act(() => {
      useFileStore.getState().addFiles([imageFile("c.webp", "image/webp")]);
    });
    expect(useFileStore.getState().error).toBeNull();
  });

  it("rejects malformed or non-JSON 2xx responses without caching them (#3155)", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        if (!String(input).endsWith(INFO_URL)) {
          return new Response("{}", { status: 200 });
        }
        call++;
        if (call === 1) {
          return new Response("{}", { status: 200 });
        }
        if (call === 2) {
          return new Response("<html>proxy ok</html>", { status: 200 });
        }
        return new Response(
          JSON.stringify(makeInfo({ filename: "a.png", width: 640, height: 480, format: "png" })),
          { status: 200 },
        );
      }),
    );

    useFileStore.getState().setFiles([imageFile("a.png", "image/png")]);
    render(
      <I18nProvider>
        <InfoSettings />
      </I18nProvider>,
    );

    fireEvent.click(screen.getByTestId("info-submit"));
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(useFileStore.getState().error).toBe(en.errors.invalidServerResponse);
    expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();

    // Because the malformed payload was not cached, clicking submit again re-fetches.
    fireEvent.click(screen.getByTestId("info-submit"));
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(call).toBe(2);
    expect(useFileStore.getState().error).toBe(en.errors.invalidServerResponse);

    // Third click receives valid metadata and renders it.
    fireEvent.click(screen.getByTestId("info-submit"));
    await waitFor(() => expect(screen.getByText("640 x 480")).toBeInTheDocument());
    expect(call).toBe(3);
    expect(useFileStore.getState().error).toBeNull();
  });
});
