// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/contexts/i18n-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/i18n-context")>();
  const { en: english } = await import("@snapotter/shared");
  return {
    ...actual,
    useTranslation: () => ({
      t: english,
      locale: "en",
      dir: "ltr",
      setLocale: () => {},
      supportedLocales: [],
    }),
  };
});

import { BarcodeGenerateSettings } from "@/components/tools/barcode-generate-settings";
import { BeautifySettings } from "@/components/tools/beautify-settings";
import { ColorPaletteSettings } from "@/components/tools/color-palette-settings";
import { CompareSettings } from "@/components/tools/compare-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
import { EditMetadataSettings } from "@/components/tools/edit-metadata-settings";
import { InfoSettings } from "@/components/tools/info-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { StripMetadataSettings } from "@/components/tools/strip-metadata-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
import { classifyFeedbackError, FeedbackCategoryError } from "@/lib/feedback";
import { format } from "@/lib/format";
import { useFileStore } from "@/stores/file-store";

class FakeXhr {
  static instances: FakeXhr[] = [];

  timeout = 0;
  status = 0;
  responseText = "";
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  upload: { onprogress: unknown } = { onprogress: null };

  constructor() {
    FakeXhr.instances.push(this);
  }

  open() {}
  setRequestHeader() {}
  sentBody: unknown = null;
  send(body?: unknown) {
    this.sentBody = body;
  }
  abort() {}

  respond(status: number, body: unknown) {
    act(() => {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    });
  }
}

function image(name: string, bytes = "png"): File {
  return new File([bytes], name, { type: "image/png" });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function chooseSecondaryFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
}

describe("self-posting tool panels: failed entry status and scoped error banners (#3235)", () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => `blob:${(blob as File).name ?? "mock"}`),
      revokeObjectURL: vi.fn(),
    });
    useFileStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    useFileStore.getState().reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("marks the captured entry failed and scopes panel error banners to the selected entry across all five panels (#3235)", async () => {
    // 1. ComposeSettings: failure while selection moves mid-flight lands on captured entry only.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png")]);
      useFileStore.getState().setSelectedIndex(1);

      let resolveFetch!: (res: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveFetch = resolve;
            }),
        ),
      );

      const { container, unmount } = render(<ComposeSettings />);
      chooseSecondaryFile(container, image("overlay.png"));
      fireEvent.click(screen.getByTestId("compose-submit"));

      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });

      await act(async () => {
        resolveFetch(
          new Response(JSON.stringify({ error: "Compose failed on B" }), { status: 422 }),
        );
      });

      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      const { entries } = useFileStore.getState();
      expect(entries[0].status).toBe("pending");
      expect(entries[0].error).toBeNull();
      expect(entries[1].status).toBe("failed");
      expect(entries[1].error).toBe("Compose failed on B");
      expect(screen.queryByText("Compose failed on B")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(screen.getByText("Compose failed on B")).toBeInTheDocument();
      unmount();
    }

    // 2. CompareSettings: failure while selection moves mid-flight lands on captured entry only.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png")]);
      useFileStore.getState().setSelectedIndex(1);

      let resolveFetch!: (res: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveFetch = resolve;
            }),
        ),
      );

      const { container, unmount } = render(<CompareSettings />);
      chooseSecondaryFile(container, image("second.png"));
      fireEvent.click(screen.getByTestId("compare-submit"));

      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });

      await act(async () => {
        resolveFetch(
          new Response(JSON.stringify({ error: "Compare failed on B" }), { status: 422 }),
        );
      });

      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      const { entries } = useFileStore.getState();
      expect(entries[0].status).toBe("pending");
      expect(entries[0].error).toBeNull();
      expect(entries[1].status).toBe("failed");
      expect(entries[1].error).toBe("Compare failed on B");
      expect(screen.queryByText("Compare failed on B")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(screen.getByText("Compare failed on B")).toBeInTheDocument();
      unmount();
    }

    // 3. WatermarkImageSettings: single-file failure when a second file is added mid-flight, plus batch item error scoping and retry clearing.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);

      let resolveFetch!: (res: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveFetch = resolve;
            }),
        ),
      );

      const { container, unmount } = render(<WatermarkImageSettings />);
      chooseSecondaryFile(container, image("mark.png"));
      fireEvent.click(screen.getByTestId("watermark-image-submit"));

      act(() => {
        useFileStore.getState().addFiles([image("b.png")]);
        useFileStore.getState().setSelectedIndex(1);
      });

      await act(async () => {
        resolveFetch(
          new Response(JSON.stringify({ error: "Watermark failed on A" }), { status: 422 }),
        );
      });

      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      const { entries } = useFileStore.getState();
      expect(entries[0].status).toBe("failed");
      expect(entries[0].error).toBe("Watermark failed on A");
      expect(entries[1].status).toBe("pending");
      expect(entries[1].error).toBeNull();
      expect(screen.queryByText("Watermark failed on A")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      expect(screen.getByText("Watermark failed on A")).toBeInTheDocument();

      // Re-running as a 2-file batch where a.png succeeds and b.png fails clears A's error and scopes B's error to index 1.
      let batchCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          batchCall++;
          if (batchCall === 1) {
            return new Response(
              JSON.stringify({
                jobId: "job-wm-a",
                downloadUrl: "/api/v1/download/job-wm-a/a.png",
                originalSize: 500,
                processedSize: 480,
              }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ error: "Watermark batch B failed" }), {
            status: 500,
          });
        }),
      );
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[0].error).toBeNull();
      expect(screen.queryByText("Watermark failed on A")).not.toBeInTheDocument();
      expect(screen.queryByText("Watermark batch B failed")).not.toBeInTheDocument();
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(screen.getByText("Watermark batch B failed")).toBeInTheDocument();
      unmount();
    }

    // 4. BeautifySettings image-background branch: failure while selection moves mid-flight, then retry clears error.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png")]);
      useFileStore.getState().setSelectedIndex(1);

      let resolveFetch!: (res: Response) => void;
      vi.stubGlobal(
        "fetch",
        vi.fn(
          () =>
            new Promise<Response>((resolve) => {
              resolveFetch = resolve;
            }),
        ),
      );

      const { container, unmount } = render(<BeautifySettings />);
      fireEvent.click(screen.getByRole("button", { name: en.toolSettings.beautify.bgImage }));
      chooseSecondaryFile(container, image("bg.png"));
      fireEvent.click(screen.getByTestId("beautify-submit"));

      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });

      await act(async () => {
        resolveFetch(
          new Response(JSON.stringify({ error: "Beautify failed on B" }), { status: 422 }),
        );
      });

      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      const { entries } = useFileStore.getState();
      expect(entries[0].status).toBe("pending");
      expect(entries[0].error).toBeNull();
      expect(entries[1].status).toBe("failed");
      expect(entries[1].error).toBe("Beautify failed on B");
      expect(screen.queryByText("Beautify failed on B")).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(screen.getByText("Beautify failed on B")).toBeInTheDocument();

      // Re-running on B to 200 clears B's error and hides the banner.
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                jobId: "job-b-ok",
                downloadUrl: "/api/v1/download/job-b-ok/beautified.png",
                originalSize: 800,
                processedSize: 700,
              }),
              { status: 200 },
            ),
        ),
      );
      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() => expect(screen.getByTestId("beautify-download")).toBeInTheDocument());
      expect(useFileStore.getState().entries[1].status).toBe("completed");
      expect(useFileStore.getState().entries[1].error).toBeNull();
      expect(screen.queryByText("Beautify failed on B")).not.toBeInTheDocument();
      unmount();
    }

    // 5. StitchSettings: malformed 200, non-2xx, network error, and synchronous send throw all mark capturedEntry failed.
    {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png")]);
      useFileStore.getState().setSelectedIndex(1);

      const { unmount } = render(<StitchSettings />);

      // 5a. Malformed 200 body while selection moves to index 0.
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      FakeXhr.instances[0].respond(200, {});
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].status).toBe("pending");
      expect(useFileStore.getState().entries[1].status).toBe("failed");
      expect(useFileStore.getState().entries[1].error).toBe(en.errors.invalidResponse);
      expect(useFileStore.getState().entries[1].errorCategory).toBe("processing_error");
      expect(
        classifyFeedbackError(
          useFileStore.getState().entries[1].error,
          useFileStore.getState().entries[1].errorCategory,
        ),
      ).toBe("processing_error");
      expect(screen.queryByText(en.errors.invalidResponse)).not.toBeInTheDocument();
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument();

      // 5b. XHR network error (onerror).
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      act(() => {
        FakeXhr.instances[1].onerror?.();
      });
      expect(useFileStore.getState().entries[1].status).toBe("failed");
      expect(useFileStore.getState().entries[1].error).toBe(en.errors.network);
      expect(screen.getByText(en.errors.network)).toBeInTheDocument();

      // 5c. Synchronous throw from xhr.send.
      vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
        throw new Error("Stitch send threw");
      });
      fireEvent.click(screen.getByTestId("stitch-submit"));
      expect(useFileStore.getState().entries[1].status).toBe("failed");
      expect(useFileStore.getState().entries[1].error).toBe("Stitch send threw");
      expect(screen.getByText("Stitch send threw")).toBeInTheDocument();
      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      expect(screen.queryByText("Stitch send threw")).not.toBeInTheDocument();
      unmount();
    }
  });

  it("rejects non-JSON and malformed 2xx payloads with invalidServerResponse across color-palette, info, compare, compose, and watermark-image (#3155)", async () => {
    // 1. ColorPaletteSettings
    for (const badBody of [
      "<html>gateway</html>",
      "{}",
      JSON.stringify({ colors: [], hex: [] }),
      JSON.stringify({ colors: [""], hex: ["#ff0000"] }),
      JSON.stringify({ colors: ["#ff0000", "#00ff00"], hex: ["#ff0000"] }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { unmount } = render(<ColorPaletteSettings />);
      fireEvent.click(screen.getByTestId("color-palette-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      expect(useFileStore.getState().error).toBe(en.errors.invalidServerResponse);
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      expect(screen.queryByTestId("color-palette-strip")).not.toBeInTheDocument();
      unmount();
    }

    // 2. InfoSettings
    for (const badBody of [
      "<html>gateway</html>",
      "{}",
      JSON.stringify({
        filename: "a.png",
        fileSize: 100,
        width: 10,
        height: 10,
        format: "png",
        channels: 3,
        colorSpace: "srgb",
        density: null,
        pages: 1,
        histogram: [null],
      }),
      JSON.stringify({
        filename: "a.png",
        fileSize: 100,
        width: 10,
        height: 10,
        format: "png",
        channels: 3,
        colorSpace: "srgb",
        density: null,
        pages: 1,
        histogram: [{ channel: "", min: 0, max: 255, mean: 128 }],
      }),
      JSON.stringify({
        filename: "a.png",
        fileSize: 100,
        width: 10,
        height: 10,
        format: "png",
        channels: 3,
        colorSpace: "",
        density: null,
        pages: 1,
        histogram: [],
      }),
      JSON.stringify({
        filename: "a.png",
        fileSize: 100,
        width: 10,
        height: 10,
        format: "png",
        channels: 3,
        colorSpace: "srgb",
        density: "invalid",
        pages: 1,
        histogram: [],
      }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { unmount } = render(<InfoSettings />);
      fireEvent.click(screen.getByTestId("info-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      expect(useFileStore.getState().error).toBe(en.errors.invalidServerResponse);
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      unmount();
    }

    // 3. CompareSettings
    for (const badBody of [
      "<html>gateway</html>",
      "{}",
      JSON.stringify({ similarity: 95.0, downloadUrl: "" }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/diff.png" }),
      JSON.stringify({ similarity: "95.0", downloadUrl: "/api/v1/download/j/diff.png" }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.mocked(URL.createObjectURL).mockClear();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { container, unmount } = render(<CompareSettings />);
      chooseSecondaryFile(container, image("second.png"));
      fireEvent.click(screen.getByTestId("compare-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      const entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.processedUrl).toBeNull();
      expect(entry.error).toBe(en.errors.invalidServerResponse);
      expect(entry.errorCategory).toBe("processing_error");
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("processing_error");
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      expect(screen.queryByTestId("compare-download")).not.toBeInTheDocument();
      unmount();
    }

    // 4. ComposeSettings
    for (const badBody of [
      "<html>gateway</html>",
      "{}",
      JSON.stringify({ downloadUrl: "" }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/out.png", originalSize: -1 }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/out.png", previewUrl: "" }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { container, unmount } = render(<ComposeSettings />);
      chooseSecondaryFile(container, image("overlay.png"));
      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      const entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.processedUrl).toBeNull();
      expect(entry.error).toBe(en.errors.invalidServerResponse);
      expect(entry.errorCategory).toBe("processing_error");
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("processing_error");
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      expect(screen.queryByTestId("compose-download")).not.toBeInTheDocument();
      unmount();
    }

    // ComposeSettings also accepts a minimal 200 response with only downloadUrl and rethrows non-SyntaxError body read failures.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      let composeCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          composeCall++;
          if (composeCall === 1) {
            return new Response(JSON.stringify({ downloadUrl: "/api/v1/download/j/minimal.png" }), {
              status: 200,
            });
          }
          return {
            ok: true,
            status: 200,
            json: () => Promise.reject(new TypeError("Stream disconnected")),
          } as unknown as Response;
        }),
      );

      const { container, unmount } = render(<ComposeSettings />);
      chooseSecondaryFile(container, image("overlay.png"));
      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[0].processedUrl).toBe(
        "/api/v1/download/j/minimal.png",
      );
      expect(useFileStore.getState().entries[0].originalSize).toBe(3);
      expect(useFileStore.getState().entries[0].processedSize).toBeNull();
      expect(screen.queryByText(/KB/)).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].status).toBe("failed");
      expect(useFileStore.getState().entries[0].error).toBe("Stream disconnected");
      unmount();
    }

    // 5. WatermarkImageSettings (single-file and multi-file batch branches)
    for (const badBody of [
      "<html>gateway</html>",
      "{}",
      JSON.stringify({ downloadUrl: "" }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/out.png", processedSize: -5 }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/out.png", previewUrl: "" }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { container, unmount } = render(<WatermarkImageSettings />);
      chooseSecondaryFile(container, image("mark.png"));
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      const entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.processedUrl).toBeNull();
      expect(entry.error).toBe(en.errors.invalidServerResponse);
      expect(entry.errorCategory).toBe("processing_error");
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("processing_error");
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      expect(screen.queryByTestId("watermark-image-download")).not.toBeInTheDocument();
      unmount();
    }

    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png"), image("c.png")]);
      let batchCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          batchCall++;
          if (batchCall === 1) {
            return new Response("{}", { status: 200 });
          }
          if (batchCall === 2) {
            return new Response(
              JSON.stringify({
                downloadUrl: "/api/v1/download/j/b.png",
              }),
              { status: 200 },
            );
          }
          return new Response("<html>gateway</html>", { status: 200 });
        }),
      );

      const { container, unmount } = render(<WatermarkImageSettings />);
      chooseSecondaryFile(container, image("mark.png"));
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      const { entries } = useFileStore.getState();
      expect(entries[0].status).toBe("failed");
      expect(entries[0].processedUrl).toBeNull();
      expect(entries[0].error).toBe(en.errors.invalidServerResponse);
      expect(entries[0].errorCategory).toBe("processing_error");
      expect(classifyFeedbackError(entries[0].error, entries[0].errorCategory)).toBe(
        "processing_error",
      );
      expect(entries[1].status).toBe("completed");
      expect(entries[1].processedUrl).toBe("/api/v1/download/j/b.png");
      expect(entries[1].originalSize).toBe(3);
      expect(entries[1].processedSize).toBeNull();
      expect(entries[1].error).toBeNull();
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(screen.queryByText(/KB/)).not.toBeInTheDocument();
      expect(entries[2].status).toBe("failed");
      expect(entries[2].processedUrl).toBeNull();
      expect(entries[2].error).toBe(en.errors.invalidServerResponse);
      expect(entries[2].errorCategory).toBe("processing_error");
      expect(classifyFeedbackError(entries[2].error, entries[2].errorCategory)).toBe(
        "processing_error",
      );
      unmount();
    }
  });

  it("preserves entry.originalSize and renders inline size summary when compose and watermark-image 2xx responses omit or null originalSize (#3506, #3673)", async () => {
    // 1. ComposeSettings: omitted originalSize, null originalSize, and explicit numeric originalSize.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png", "x".repeat(1024))]);
      expect(useFileStore.getState().entries[0].originalSize).toBe(1024);

      let composeCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          composeCall++;
          if (composeCall === 1) {
            return new Response(
              JSON.stringify({
                downloadUrl: "/api/v1/download/j/compose-omitted.png",
                processedSize: 512,
              }),
              { status: 200 },
            );
          }
          if (composeCall === 2) {
            return new Response(
              JSON.stringify({
                downloadUrl: "/api/v1/download/j/compose-null.png",
                originalSize: null,
                processedSize: 256,
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              downloadUrl: "/api/v1/download/j/compose-explicit.png",
              originalSize: 2048,
              processedSize: 512,
            }),
            { status: 200 },
          );
        }),
      );

      const { container, unmount } = render(<ComposeSettings />);
      chooseSecondaryFile(container, image("overlay.png"));

      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].originalSize).toBe(1024);
      expect(useFileStore.getState().originalSize).toBe(1024);
      expect(
        screen.getByText(format(en.toolSettings.compose.originalKb, { size: "1.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings.compose.processedKb, { size: "0.5" })),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].originalSize).toBe(1024);
      expect(useFileStore.getState().originalSize).toBe(1024);
      expect(
        screen.getByText(format(en.toolSettings.compose.originalKb, { size: "1.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings.compose.processedKb, { size: "0.3" })),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].originalSize).toBe(2048);
      expect(useFileStore.getState().originalSize).toBe(2048);
      expect(
        screen.getByText(format(en.toolSettings.compose.originalKb, { size: "2.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings.compose.processedKb, { size: "0.5" })),
      ).toBeInTheDocument();
      unmount();
    }

    // 2. WatermarkImageSettings (single-file branch): omitted originalSize, null originalSize, and explicit numeric originalSize.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png", "x".repeat(1024))]);
      expect(useFileStore.getState().entries[0].originalSize).toBe(1024);

      let singleCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          singleCall++;
          if (singleCall === 1) {
            return new Response(
              JSON.stringify({
                downloadUrl: "/api/v1/download/j/wm-omitted.png",
                processedSize: 512,
              }),
              { status: 200 },
            );
          }
          if (singleCall === 2) {
            return new Response(
              JSON.stringify({
                downloadUrl: "/api/v1/download/j/wm-null.png",
                originalSize: null,
                processedSize: 256,
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              downloadUrl: "/api/v1/download/j/wm-explicit.png",
              originalSize: 2048,
              processedSize: 1536,
            }),
            { status: 200 },
          );
        }),
      );

      const { container, unmount } = render(<WatermarkImageSettings />);
      chooseSecondaryFile(container, image("mark.png"));

      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].originalSize).toBe(1024);
      expect(useFileStore.getState().originalSize).toBe(1024);
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].originalKb, { size: "1.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].processedKb, { size: "0.5" })),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].originalSize).toBe(1024);
      expect(useFileStore.getState().originalSize).toBe(1024);
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].originalKb, { size: "1.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].processedKb, { size: "0.3" })),
      ).toBeInTheDocument();

      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].originalSize).toBe(2048);
      expect(useFileStore.getState().originalSize).toBe(2048);
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].originalKb, { size: "2.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].processedKb, { size: "1.5" })),
      ).toBeInTheDocument();
      unmount();
    }

    // 3. WatermarkImageSettings (multi-file batch branch): omitted originalSize, null originalSize, and explicit numeric originalSize.
    {
      useFileStore.getState().reset();
      useFileStore
        .getState()
        .setFiles([
          image("a.png", "a".repeat(1024)),
          image("b.png", "b".repeat(2048)),
          image("c.png", "c".repeat(3072)),
        ]);
      expect(useFileStore.getState().entries.map((e) => e.originalSize)).toEqual([
        1024, 2048, 3072,
      ]);

      let batchCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          batchCall++;
          if (batchCall === 1) {
            return new Response(
              JSON.stringify({
                downloadUrl: "/api/v1/download/j/batch-a.png",
                processedSize: 512,
              }),
              { status: 200 },
            );
          }
          if (batchCall === 2) {
            return new Response(
              JSON.stringify({
                downloadUrl: "/api/v1/download/j/batch-b.png",
                originalSize: null,
                processedSize: 1536,
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              downloadUrl: "/api/v1/download/j/batch-c.png",
              originalSize: 4096,
              processedSize: 3072,
            }),
            { status: 200 },
          );
        }),
      );

      const { container, unmount } = render(<WatermarkImageSettings />);
      chooseSecondaryFile(container, image("mark.png"));

      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries.map((e) => e.originalSize)).toEqual([
        1024, 2048, 4096,
      ]);
      expect(useFileStore.getState().originalSize).toBe(1024);
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].originalKb, { size: "1.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].processedKb, { size: "0.5" })),
      ).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].originalKb, { size: "2.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].processedKb, { size: "1.5" })),
      ).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].originalKb, { size: "4.0" })),
      ).toBeInTheDocument();
      expect(
        screen.getByText(format(en.toolSettings["watermark-image"].processedKb, { size: "3.0" })),
      ).toBeInTheDocument();
      unmount();
    }
  });

  it("rejects non-JSON and malformed 2xx payloads across beautify, barcode-generate, strip-metadata, and edit-metadata (#3496)", async () => {
    // 1. BeautifySettings (image-background branch)
    for (const badBody of [
      "<html>gateway</html>",
      "null",
      "{}",
      "[]",
      JSON.stringify({ downloadUrl: "" }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/out.png", originalSize: -1 }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/out.png", processedSize: -1 }),
      JSON.stringify({ downloadUrl: "/api/v1/download/j/out.png", previewUrl: "" }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { container, unmount } = render(<BeautifySettings />);
      fireEvent.click(screen.getByRole("button", { name: en.toolSettings.beautify.bgImage }));
      chooseSecondaryFile(container, image("bg.png"));
      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      const entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.processedUrl).toBeNull();
      expect(entry.error).toBe(en.errors.invalidServerResponse);
      expect(entry.errorCategory).toBe("processing_error");
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("processing_error");
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      expect(screen.queryByTestId("beautify-download")).not.toBeInTheDocument();
      unmount();
    }

    // BeautifySettings also accepts a minimal 200 response with only downloadUrl and rethrows non-SyntaxError body read failures.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      let beautifyCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          beautifyCall++;
          if (beautifyCall === 1) {
            return new Response(
              JSON.stringify({ downloadUrl: "/api/v1/download/j/beautify-min.png" }),
              { status: 200 },
            );
          }
          return {
            ok: true,
            status: 200,
            json: () => Promise.reject(new TypeError("Beautify stream disconnected")),
          } as unknown as Response;
        }),
      );

      const { container, unmount } = render(<BeautifySettings />);
      fireEvent.click(screen.getByRole("button", { name: en.toolSettings.beautify.bgImage }));
      chooseSecondaryFile(container, image("bg.png"));
      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].status).toBe("completed");
      expect(useFileStore.getState().entries[0].processedUrl).toBe(
        "/api/v1/download/j/beautify-min.png",
      );
      expect(useFileStore.getState().entries[0].originalSize).toBe(3);
      expect(useFileStore.getState().entries[0].processedSize).toBeNull();

      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0].status).toBe("failed");
      expect(useFileStore.getState().entries[0].error).toBe("Beautify stream disconnected");
      unmount();
    }

    // 2. BarcodeGenerateSettings
    for (const badBody of [
      "<html>gateway</html>",
      "null",
      "{}",
      "[]",
      JSON.stringify({ downloadUrl: "" }),
      JSON.stringify({ downloadUrl: 42 }),
    ]) {
      useFileStore.getState().reset();
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { unmount } = render(<BarcodeGenerateSettings />);
      fireEvent.change(screen.getByTestId("barcode-input-text"), { target: { value: "12345" } });
      fireEvent.click(screen.getByTestId("barcode-generate-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      expect(useFileStore.getState().error).toBe(en.errors.invalidServerResponse);
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      expect(screen.queryByTestId("barcode-generate-download")).not.toBeInTheDocument();
      unmount();
    }

    // BarcodeGenerateSettings rethrows non-SyntaxError body read failures and accepts valid downloadUrl.
    {
      useFileStore.getState().reset();
      let barcodeCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          barcodeCall++;
          if (barcodeCall === 1) {
            return {
              ok: true,
              status: 200,
              json: () => Promise.reject(new TypeError("Barcode stream disconnected")),
            } as unknown as Response;
          }
          return new Response(JSON.stringify({ downloadUrl: "/api/v1/download/j/barcode.png" }), {
            status: 200,
          });
        }),
      );

      const { unmount } = render(<BarcodeGenerateSettings />);
      fireEvent.change(screen.getByTestId("barcode-input-text"), { target: { value: "12345" } });
      fireEvent.click(screen.getByTestId("barcode-generate-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().error).toBe("Barcode stream disconnected");
      expect(screen.queryByTestId("barcode-generate-download")).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId("barcode-generate-submit"));
      await waitFor(() =>
        expect(screen.getByTestId("barcode-generate-download")).toHaveAttribute(
          "href",
          "/api/v1/download/j/barcode.png",
        ),
      );
      expect(useFileStore.getState().error).toBeNull();
      unmount();
    }

    // 3. StripMetadataSettings (inspect)
    for (const badBody of [
      "<html>gateway</html>",
      "null",
      "{}",
      "[]",
      JSON.stringify({ filename: "", fileSize: 100 }),
      JSON.stringify({ filename: "a.png", fileSize: -1 }),
      JSON.stringify({ filename: "a.png", fileSize: 100, exif: "not-an-object" }),
      JSON.stringify({ filename: "a.png", fileSize: 100, exifError: 123 }),
      JSON.stringify({ filename: "a.png", fileSize: 100, gps: [] }),
      JSON.stringify({
        filename: "a.png",
        fileSize: 100,
        gps: { _latitude: "51.5", _longitude: -0.1 },
      }),
      JSON.stringify({ filename: "a.png", fileSize: 100, icc: "not-an-object" }),
      JSON.stringify({ filename: "a.png", fileSize: 100, xmp: 42 }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { unmount } = render(<StripMetadataSettings />);
      await waitFor(() =>
        expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].noMetadataFound),
      ).not.toBeInTheDocument();
      unmount();
    }

    // StripMetadataSettings does not cache a malformed 200 payload, rethrows non-SyntaxError body read failures, and falls back to inspectFailed when fetch rejects with an empty/whitespace Error.message or non-Error (#3692).
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png")]);
      let stripInspectCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          stripInspectCalls++;
          if (stripInspectCalls === 1) {
            return new Response("{}", { status: 200 });
          }
          if (stripInspectCalls === 2) {
            return {
              ok: true,
              status: 200,
              json: () => Promise.reject(new TypeError("Strip inspect stream disconnected")),
            } as unknown as Response;
          }
          if (stripInspectCalls === 3) {
            throw new Error("");
          }
          if (stripInspectCalls === 4) {
            throw new Error("   ");
          }
          if (stripInspectCalls === 5) {
            throw "non-error strip inspect rejection";
          }
          return new Response(JSON.stringify({ filename: "a.png", fileSize: 100 }), {
            status: 200,
          });
        }),
      );

      const { unmount } = render(<StripMetadataSettings />);
      await waitFor(() =>
        expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument(),
      );

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      await waitFor(() =>
        expect(screen.getByText("Strip inspect stream disconnected")).toBeInTheDocument(),
      );

      // Call 3: empty Error("") falls back to inspectFailed.
      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      await waitFor(() =>
        expect(
          screen.getByText(en.toolSettings["strip-metadata"].inspectFailed),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).not.toBeInTheDocument();
      expect(stripInspectCalls).toBe(3);

      // Call 4: whitespace Error("   ") falls back to inspectFailed instead of rendering a blank <p>.
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      await waitFor(() =>
        expect(
          screen.getByText(en.toolSettings["strip-metadata"].inspectFailed),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).not.toBeInTheDocument();
      expect(stripInspectCalls).toBe(4);

      // Call 5: non-Error rejection falls back to inspectFailed.
      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      await waitFor(() =>
        expect(
          screen.getByText(en.toolSettings["strip-metadata"].inspectFailed),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).not.toBeInTheDocument();
      expect(stripInspectCalls).toBe(5);

      // Call 6: switching to index 1 refetches because none of the failures were cached.
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      await waitFor(() =>
        expect(
          screen.getByText(en.toolSettings["strip-metadata"].noMetadataFound),
        ).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].inspectFailed),
      ).not.toBeInTheDocument();
      expect(stripInspectCalls).toBe(6);
      unmount();
    }

    // StripMetadataSettings renders metadata.exifError instead of noMetadataFound when ICC and XMP are absent, keeps sectionCount scoped to present sections when ICC/XMP coexist with exifError, and ignores whitespace-only exifError (#3770).
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.jpg"), image("b.jpg"), image("c.jpg")]);
      let inspectCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          inspectCall++;
          if (inspectCall === 1) {
            return new Response(
              JSON.stringify({
                filename: "a.jpg",
                fileSize: 1024,
                exif: null,
                exifError: "Failed to parse EXIF data",
              }),
              { status: 200 },
            );
          }
          if (inspectCall === 2) {
            return new Response(
              JSON.stringify({
                filename: "b.jpg",
                fileSize: 1024,
                exif: null,
                exifError: "  Failed to parse EXIF data  ",
                icc: { "Color Space": "RGB" },
              }),
              { status: 200 },
            );
          }
          return new Response(
            JSON.stringify({
              filename: "c.jpg",
              fileSize: 1024,
              exif: null,
              exifError: "   ",
            }),
            { status: 200 },
          );
        }),
      );

      const { container, unmount } = render(<StripMetadataSettings />);
      await waitFor(() =>
        expect(screen.getByText("EXIF: Failed to parse EXIF data")).toBeInTheDocument(),
      );
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].noMetadataFound),
      ).not.toBeInTheDocument();
      expect(screen.queryByText("0 metadata sections found")).not.toBeInTheDocument();
      expect(container.querySelectorAll(".border-t.border-border")).toHaveLength(2);

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      await waitFor(() =>
        expect(screen.getByText(en.toolSettings["strip-metadata"].iccProfile)).toBeInTheDocument(),
      );
      expect(screen.getByText("EXIF: Failed to parse EXIF data").textContent).toBe(
        "EXIF: Failed to parse EXIF data",
      );
      expect(screen.getByText("1 metadata section found")).toBeInTheDocument();
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].noMetadataFound),
      ).not.toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      await waitFor(() =>
        expect(
          screen.getByText(en.toolSettings["strip-metadata"].noMetadataFound),
        ).toBeInTheDocument(),
      );
      expect(screen.queryByText(/^EXIF:/)).not.toBeInTheDocument();
      expect(container.querySelectorAll(".border-t.border-border")).toHaveLength(1);

      unmount();
    }

    // 4. EditMetadataSettings (inspect): rejects malformed 2xx without caching or crashing
    for (const badBody of [
      "<html>gateway</html>",
      "null",
      "{}",
      "[]",
      JSON.stringify({ filename: "", fileSize: 100 }),
      JSON.stringify({ filename: "a.png", fileSize: -1 }),
      JSON.stringify({ filename: "a.png", fileSize: 100, exif: "not-an-object" }),
      JSON.stringify({ filename: "a.png", fileSize: 100, iptc: [] }),
      JSON.stringify({ filename: "a.png", fileSize: 100, gps: 42 }),
      JSON.stringify({
        filename: "a.png",
        fileSize: 100,
        gps: { GPSLatitude: "51.5", GPSLongitude: -0.1 },
      }),
      JSON.stringify({ filename: "a.png", fileSize: 100, xmp: "bad" }),
      JSON.stringify({ filename: "a.png", fileSize: 100, keywords: "not-an-array" }),
      JSON.stringify({ filename: "a.png", fileSize: 100, keywords: [42] }),
    ]) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response(badBody, { status: 200 })),
      );

      const { unmount } = render(<EditMetadataSettings />);
      await waitFor(() =>
        expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument(),
      );
      expect(screen.queryByText("EXIF/IPTC")).not.toBeInTheDocument();
      unmount();
    }

    // EditMetadataSettings does not cache a malformed 200 payload, resets form fields when switching to a file with a malformed payload, and surfaces non-SyntaxError body read failures.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png")]);
      let editInspectCalls = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          editInspectCalls++;
          if (editInspectCalls === 1) {
            return new Response("{}", { status: 200 });
          }
          if (editInspectCalls === 2) {
            return new Response(
              JSON.stringify({
                filename: "b.png",
                fileSize: 100,
                exif: { Artist: "Ada" },
                iptc: null,
                xmp: null,
                gps: null,
                keywords: ["tag1"],
              }),
              { status: 200 },
            );
          }
          return {
            ok: true,
            status: 200,
            json: () => Promise.reject(new TypeError("Edit inspect stream disconnected")),
          } as unknown as Response;
        }),
      );

      const { unmount } = render(<EditMetadataSettings />);
      await waitFor(() =>
        expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument(),
      );

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      await waitFor(() => expect(screen.getByText("EXIF/IPTC")).toBeInTheDocument());
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue("Ada");

      // Switching back to index 0 refetches because the first "{}" response was not cached, and resets form fields on stream failure.
      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      await waitFor(() =>
        expect(screen.getByText("Edit inspect stream disconnected")).toBeInTheDocument(),
      );
      expect(screen.queryByText("EXIF/IPTC")).not.toBeInTheDocument();
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue("");
      expect(editInspectCalls).toBe(3);
      unmount();
    }
  });

  it("sets errorCategory to upload_error on 413 and network failures across compose, compare, watermark-image, beautify, and stitch (#3250)", async () => {
    // 1. Fetch-based single-entry panels: ComposeSettings, CompareSettings, WatermarkImageSettings (single-file), BeautifySettings (image background).
    const fetchPanels: Array<{
      Panel: typeof ComposeSettings;
      submitId: string;
      prepare?: () => void;
    }> = [
      { Panel: ComposeSettings, submitId: "compose-submit" },
      { Panel: CompareSettings, submitId: "compare-submit" },
      { Panel: WatermarkImageSettings, submitId: "watermark-image-submit" },
      {
        Panel: BeautifySettings,
        submitId: "beautify-submit",
        prepare: () => {
          fireEvent.click(screen.getByRole("button", { name: en.toolSettings.beautify.bgImage }));
        },
      },
    ];

    for (const { Panel, submitId, prepare } of fetchPanels) {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png")]);

      let call = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          call++;
          if (call === 1) {
            return new Response(JSON.stringify({ error: "Payload too large" }), { status: 413 });
          }
          if (call === 2) {
            throw new TypeError("Failed to fetch");
          }
          if (call === 3) {
            throw "non-error network rejection";
          }
          if (call === 4) {
            return new Response(JSON.stringify({ error: "Server processing failed" }), {
              status: 422,
            });
          }
          throw new DOMException("The operation was aborted.", "AbortError");
        }),
      );

      const { container, unmount } = render(<Panel />);
      prepare?.();
      chooseSecondaryFile(container, image("second.png"));

      // 1a. HTTP 413 -> errorCategory: "upload_error"
      fireEvent.click(screen.getByTestId(submitId));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      let entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.error).toBe(en.errors.fileTooLarge);
      expect(entry.errorCategory).toBe("upload_error");
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("upload_error");

      // 1b. Fetch network error (TypeError) -> errorCategory: "upload_error"
      fireEvent.click(screen.getByTestId(submitId));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.error).toBe("Failed to fetch");
      expect(entry.errorCategory).toBe("upload_error");
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("upload_error");

      // 1c. Fetch non-Error rejection -> fallback message with errorCategory: "upload_error"
      fireEvent.click(screen.getByTestId(submitId));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.error).toBe(en.errors.network);
      expect(entry.errorCategory).toBe("upload_error");
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("upload_error");

      // 1d. Non-413 HTTP failure -> errorCategory cleared to null
      fireEvent.click(screen.getByTestId(submitId));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("failed");
      expect(entry.error).toBe("Server processing failed");
      expect(entry.errorCategory).toBeNull();
      expect(classifyFeedbackError(entry.error, entry.errorCategory)).toBe("processing_error");

      // 1e. AbortError pass-through does not wrap into FeedbackCategoryError or mark entry failed
      fireEvent.click(screen.getByTestId(submitId));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      entry = useFileStore.getState().entries[0];
      expect(entry.status).toBe("pending");
      expect(entry.error).toBeNull();
      expect(entry.errorCategory).toBeNull();

      unmount();
    }

    // 2. WatermarkImageSettings multi-file batch branch: 413, network failure, non-Error rejection, non-413 failure, body-read error in catch, and AbortError per entry.
    {
      useFileStore.getState().reset();
      useFileStore
        .getState()
        .setFiles([image("a.png"), image("b.png"), image("c.png"), image("d.png"), image("e.png")]);

      let batchCall = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          batchCall++;
          if (batchCall === 1) {
            return new Response("<html>413 Entity Too Large</html>", { status: 413 });
          }
          if (batchCall === 2) {
            throw new TypeError("Failed to fetch");
          }
          if (batchCall === 3) {
            throw "non-error batch rejection";
          }
          if (batchCall === 4) {
            return new Response(JSON.stringify({ error: "Watermark failed on D" }), {
              status: 500,
            });
          }
          if (batchCall === 5) {
            return {
              ok: true,
              status: 200,
              json: () => Promise.reject(new TypeError("Watermark body stream disconnected")),
            } as unknown as Response;
          }
          throw new DOMException("The operation was aborted.", "AbortError");
        }),
      );

      const { container, unmount } = render(<WatermarkImageSettings />);
      chooseSecondaryFile(container, image("mark.png"));
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      const { entries } = useFileStore.getState();
      expect(entries[0]).toMatchObject({
        status: "failed",
        error: en.errors.fileTooLarge,
        errorCategory: "upload_error",
      });
      expect(classifyFeedbackError(entries[0].error, entries[0].errorCategory)).toBe(
        "upload_error",
      );
      expect(entries[1]).toMatchObject({
        status: "failed",
        error: "Failed to fetch",
        errorCategory: "upload_error",
      });
      expect(classifyFeedbackError(entries[1].error, entries[1].errorCategory)).toBe(
        "upload_error",
      );
      expect(entries[2]).toMatchObject({
        status: "failed",
        error: en.errors.network,
        errorCategory: "upload_error",
      });
      expect(classifyFeedbackError(entries[2].error, entries[2].errorCategory)).toBe(
        "upload_error",
      );
      expect(entries[3]).toMatchObject({
        status: "failed",
        error: "Watermark failed on D",
        errorCategory: null,
      });
      expect(classifyFeedbackError(entries[3].error, entries[3].errorCategory)).toBe(
        "processing_error",
      );
      expect(entries[4]).toMatchObject({
        status: "failed",
        error: "Watermark body stream disconnected",
        errorCategory: null,
      });

      // Re-running when fetch rejects with AbortError resets the active entry to pending with errorCategory: null
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "pending",
        error: null,
        errorCategory: null,
      });
      unmount();
    }

    // 3. StitchSettings (XHR): 413 (JSON and non-JSON), onerror, non-413 status, and send throw.
    {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png")]);

      const { unmount } = render(<StitchSettings />);

      // 3a. HTTP 413 (JSON body)
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
      FakeXhr.instances[0].respond(413, { error: "File too large" });
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: en.errors.fileTooLarge,
        errorCategory: "upload_error",
      });
      expect(
        classifyFeedbackError(
          useFileStore.getState().entries[0].error,
          useFileStore.getState().entries[0].errorCategory,
        ),
      ).toBe("upload_error");

      // 3b. Non-413 HTTP failure clears errorCategory to null
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      FakeXhr.instances[1].respond(422, { error: "Dimensions mismatch" });
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: "Dimensions mismatch",
        errorCategory: null,
      });

      // 3c. HTTP 413 (non-JSON HTML proxy page)
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(3));
      act(() => {
        FakeXhr.instances[2].status = 413;
        FakeXhr.instances[2].responseText = "<html>413 Request Entity Too Large</html>";
        FakeXhr.instances[2].onload?.();
      });
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: en.errors.fileTooLarge,
        errorCategory: "upload_error",
      });

      // 3d. XHR network error (onerror) -> errorCategory: "upload_error"
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(4));
      act(() => {
        FakeXhr.instances[3].onerror?.();
      });
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: en.errors.network,
        errorCategory: "upload_error",
      });
      expect(
        classifyFeedbackError(
          useFileStore.getState().entries[0].error,
          useFileStore.getState().entries[0].errorCategory,
        ),
      ).toBe("upload_error");

      // 3e. Synchronous throw from xhr.send forwards feedbackCategoryOf(err) and clears to null on plain Error
      vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
        throw new Error("Stitch send threw");
      });
      fireEvent.click(screen.getByTestId("stitch-submit"));
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: "Stitch send threw",
        errorCategory: null,
      });

      vi.spyOn(FakeXhr.prototype, "send").mockImplementationOnce(() => {
        throw new FeedbackCategoryError("Categorized send failure", "upload_error");
      });
      fireEvent.click(screen.getByTestId("stitch-submit"));
      expect(useFileStore.getState().entries[0]).toMatchObject({
        status: "failed",
        error: "Categorized send failure",
        errorCategory: "upload_error",
      });

      unmount();
    }
  });

  it("ignores aborted inspect completions and does not re-trigger inspect effects on cache updates in StripMetadataSettings and EditMetadataSettings (#3507)", async () => {
    // 1. StripMetadataSettings: switching files while an inspect request is in flight does not clear inspecting, overwrite metadata/error, or re-run the effect when the aborted request resolves.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png"), image("c.png")]);

      const pending: Array<{
        signal: AbortSignal | null | undefined;
        res: ReturnType<typeof deferred<Response>>;
      }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
          const res = deferred<Response>();
          pending.push({ signal: init?.signal, res });
          return res.promise;
        }),
      );

      const { unmount } = render(<StripMetadataSettings />);
      expect(pending).toHaveLength(1);
      expect(
        screen.getByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).toBeInTheDocument();

      // Switch to b.png while a.png's inspect request is still pending.
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending).toHaveLength(2);
      expect(pending[0].signal?.aborted).toBe(true);
      expect(pending[1].signal?.aborted).toBe(false);

      // Resolve a.png's aborted request with valid metadata before b.png settles.
      await act(async () => {
        pending[0].res.resolve(
          new Response(
            JSON.stringify({
              filename: "a.png",
              fileSize: 100,
              exif: { Artist: "StaleArtistA" },
            }),
            { status: 200 },
          ),
        );
      });

      // b.png must still be inspecting, not overwritten by a.png, and not re-fetched.
      expect(pending).toHaveLength(2);
      expect(pending[1].signal?.aborted).toBe(false);
      expect(
        screen.getByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).toBeInTheDocument();
      expect(screen.queryByText("StaleArtistA")).not.toBeInTheDocument();

      // Now resolve b.png's inspect request.
      await act(async () => {
        pending[1].res.resolve(
          new Response(
            JSON.stringify({
              filename: "b.png",
              fileSize: 200,
              exif: { Artist: "FreshArtistB" },
            }),
            { status: 200 },
          ),
        );
      });

      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).not.toBeInTheDocument();
      expect(screen.getByText("FreshArtistB")).toBeInTheDocument();
      // Caching b.png must not re-trigger the useEffect or abort anything.
      expect(pending).toHaveLength(2);

      // Switch to c.png (starts request #3), resolve 500 headers first, then switch back to cached b.png while body.json() is pending.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(3);
      expect(
        screen.getByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).toBeInTheDocument();

      const cErrorBody = deferred<Record<string, unknown>>();
      await act(async () => {
        pending[2].res.resolve({
          ok: false,
          status: 500,
          json: () => cErrorBody.promise,
        } as unknown as Response);
      });

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending).toHaveLength(3);
      expect(pending[2].signal?.aborted).toBe(true);
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).not.toBeInTheDocument();
      expect(screen.getByText("FreshArtistB")).toBeInTheDocument();

      await act(async () => {
        cErrorBody.resolve({ error: "Stale c.png error" });
      });
      expect(screen.queryByText("Stale c.png error")).not.toBeInTheDocument();
      expect(screen.getByText("FreshArtistB")).toBeInTheDocument();

      // Switch to c.png again (starts request #4), let it fail while selected so inspectError renders, then switch to cached b.png to verify cache hit clears inspectError.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(4);
      await act(async () => {
        pending[3].res.resolve(
          new Response(JSON.stringify({ error: "Active c.png error" }), { status: 500 }),
        );
      });
      expect(screen.getByText("Active c.png error")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending).toHaveLength(4);
      expect(screen.queryByText("Active c.png error")).not.toBeInTheDocument();
      expect(screen.getByText("FreshArtistB")).toBeInTheDocument();

      // Switch to c.png (starts request #5), abort by switching to b.png, and reject request #5 with a non-AbortError to exercise the catch abort guard.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(5);
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending[4].signal?.aborted).toBe(true);
      await act(async () => {
        pending[4].res.reject(new TypeError("Aborted network failure"));
      });
      expect(screen.queryByText("Aborted network failure")).not.toBeInTheDocument();
      expect(screen.getByText("FreshArtistB")).toBeInTheDocument();

      // Switch to c.png (starts request #6), resolve 200 headers first, then switch to an out-of-range index while res.json() is pending (hasFile stays true, currentFile is null).
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(6);
      const cOkBody = deferred<Record<string, unknown>>();
      await act(async () => {
        pending[5].res.resolve({
          ok: true,
          status: 200,
          json: () => cOkBody.promise,
        } as unknown as Response);
      });

      act(() => {
        useFileStore.getState().setSelectedIndex(99);
      });
      expect(pending[5].signal?.aborted).toBe(true);
      expect(
        screen.queryByText(en.toolSettings["strip-metadata"].readingMetadata),
      ).not.toBeInTheDocument();

      await act(async () => {
        cOkBody.resolve({
          filename: "c.png",
          fileSize: 300,
          exif: { Artist: "StaleArtistC" },
        });
      });
      expect(screen.queryByText("StaleArtistC")).not.toBeInTheDocument();
      expect(pending).toHaveLength(6);

      // Re-selecting c.png starts request #7 because the aborted 200 response was not cached.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(7);

      unmount();
    }

    // 2. EditMetadataSettings: switching files while an inspect request is in flight does not clear inspecting, overwrite form/inspectData/error, or re-run the effect when the aborted request resolves.
    {
      useFileStore.getState().reset();
      useFileStore.getState().setFiles([image("a.png"), image("b.png"), image("c.png")]);

      const pending: Array<{
        signal: AbortSignal | null | undefined;
        res: ReturnType<typeof deferred<Response>>;
      }> = [];
      vi.stubGlobal(
        "fetch",
        vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
          const res = deferred<Response>();
          pending.push({ signal: init?.signal, res });
          return res.promise;
        }),
      );

      const { unmount } = render(<EditMetadataSettings />);
      expect(pending).toHaveLength(1);
      expect(
        screen.getByText(en.toolSettings["edit-metadata"].readingMetadata),
      ).toBeInTheDocument();

      // Switch to b.png while a.png's inspect request is still pending.
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending).toHaveLength(2);
      expect(pending[0].signal?.aborted).toBe(true);
      expect(pending[1].signal?.aborted).toBe(false);

      // Resolve a.png's aborted request with valid metadata before b.png settles.
      await act(async () => {
        pending[0].res.resolve(
          new Response(
            JSON.stringify({
              filename: "a.png",
              fileSize: 100,
              exif: { Artist: "StaleArtistA" },
              iptc: null,
              xmp: null,
              gps: null,
              keywords: ["stale-kw"],
            }),
            { status: 200 },
          ),
        );
      });

      // b.png must still be inspecting, not overwritten by a.png, and not re-fetched.
      expect(pending).toHaveLength(2);
      expect(pending[1].signal?.aborted).toBe(false);
      expect(
        screen.getByText(en.toolSettings["edit-metadata"].readingMetadata),
      ).toBeInTheDocument();
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue("");
      expect(screen.queryByText("EXIF/IPTC")).not.toBeInTheDocument();

      // Now resolve b.png's inspect request.
      await act(async () => {
        pending[1].res.resolve(
          new Response(
            JSON.stringify({
              filename: "b.png",
              fileSize: 200,
              exif: { Artist: "FreshArtistB" },
              iptc: null,
              xmp: null,
              gps: null,
              keywords: ["fresh-kw"],
            }),
            { status: 200 },
          ),
        );
      });

      expect(
        screen.queryByText(en.toolSettings["edit-metadata"].readingMetadata),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue(
        "FreshArtistB",
      );
      expect(screen.getByText("EXIF/IPTC")).toBeInTheDocument();
      // Caching b.png must not re-trigger the useEffect or abort anything.
      expect(pending).toHaveLength(2);

      // Switch to c.png (starts request #3), resolve 500 headers first, then switch back to cached b.png while body.json() is pending.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(3);
      expect(
        screen.getByText(en.toolSettings["edit-metadata"].readingMetadata),
      ).toBeInTheDocument();

      const cErrorBody = deferred<Record<string, unknown>>();
      await act(async () => {
        pending[2].res.resolve({
          ok: false,
          status: 500,
          json: () => cErrorBody.promise,
        } as unknown as Response);
      });

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending).toHaveLength(3);
      expect(pending[2].signal?.aborted).toBe(true);
      expect(
        screen.queryByText(en.toolSettings["edit-metadata"].readingMetadata),
      ).not.toBeInTheDocument();
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue(
        "FreshArtistB",
      );

      await act(async () => {
        cErrorBody.resolve({ error: "Stale c.png error" });
      });
      expect(screen.queryByText("Stale c.png error")).not.toBeInTheDocument();
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue(
        "FreshArtistB",
      );

      // Switch to c.png again (starts request #4), let it fail while selected so inspectError renders, then switch to cached b.png to verify cache hit clears inspectError.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(4);
      await act(async () => {
        pending[3].res.resolve(
          new Response(JSON.stringify({ error: "Active c.png error" }), { status: 500 }),
        );
      });
      expect(screen.getByText("Active c.png error")).toBeInTheDocument();

      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending).toHaveLength(4);
      expect(screen.queryByText("Active c.png error")).not.toBeInTheDocument();
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue(
        "FreshArtistB",
      );

      // Switch to c.png (starts request #5), abort by switching to b.png, and reject request #5 with a non-AbortError to exercise the catch abort guard.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(5);
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      expect(pending[4].signal?.aborted).toBe(true);
      await act(async () => {
        pending[4].res.reject(new TypeError("Aborted network failure"));
      });
      expect(screen.queryByText("Aborted network failure")).not.toBeInTheDocument();
      expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue(
        "FreshArtistB",
      );

      // Switch to c.png (starts request #6), resolve 200 headers first, then switch to an out-of-range index while res.json() is pending (hasFile stays true, currentFile is null).
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(6);
      const cOkBody = deferred<Record<string, unknown>>();
      await act(async () => {
        pending[5].res.resolve({
          ok: true,
          status: 200,
          json: () => cOkBody.promise,
        } as unknown as Response);
      });

      act(() => {
        useFileStore.getState().setSelectedIndex(99);
      });
      expect(pending[5].signal?.aborted).toBe(true);
      expect(
        screen.queryByText(en.toolSettings["edit-metadata"].readingMetadata),
      ).not.toBeInTheDocument();

      await act(async () => {
        cOkBody.resolve({
          filename: "c.png",
          fileSize: 300,
          exif: { Artist: "StaleArtistC" },
          iptc: null,
          xmp: null,
          gps: null,
          keywords: [],
        });
      });
      expect(pending).toHaveLength(6);

      // Re-selecting c.png starts request #7 because the aborted 200 response was not cached.
      act(() => {
        useFileStore.getState().setSelectedIndex(2);
      });
      expect(pending).toHaveLength(7);

      unmount();
    }
  });

  it("resets form, initialForm, and fieldsToRemove when starting an uncached inspect or catching an inspect failure in EditMetadataSettings (#3677)", async () => {
    useFileStore.getState().reset();
    useFileStore.getState().setFiles([image("a.png"), image("b.png")]);

    const pending: Array<{
      signal: AbortSignal | null | undefined;
      res: ReturnType<typeof deferred<Response>>;
    }> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
        const res = deferred<Response>();
        pending.push({ signal: init?.signal, res });
        return res.promise;
      }),
    );

    const { unmount } = render(<EditMetadataSettings />);
    expect(pending).toHaveLength(1);

    // 1. Resolve a.png with EXIF metadata and mark "Make" for removal.
    await act(async () => {
      pending[0].res.resolve(
        new Response(
          JSON.stringify({
            filename: "a.png",
            fileSize: 100,
            exif: { Artist: "Ada", Make: "Canon" },
            iptc: null,
            xmp: null,
            gps: null,
            keywords: ["portrait"],
          }),
          { status: 200 },
        ),
      );
    });

    expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue("Ada");

    // Open All Metadata -> EXIF and mark "Make" for removal.
    fireEvent.click(
      screen.getByRole("button", { name: en.toolSettings["edit-metadata"].allMetadata }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^EXIF\d/ }));
    fireEvent.click(
      screen.getByTitle(en.commonUi.metadataGrid.removeField.replace("{field}", "Camera Make")),
    );
    expect(screen.getByText(/1 removed/i)).toBeInTheDocument();

    // 2. Switch to uncached b.png while its inspect request is pending.
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(pending).toHaveLength(2);
    expect(screen.getByText(en.toolSettings["edit-metadata"].readingMetadata)).toBeInTheDocument();

    // Form inputs and fieldsToRemove summary must reset immediately when the uncached inspect starts.
    expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue("");
    expect(screen.queryByText(/removed/i)).not.toBeInTheDocument();

    // Typing "Ada" (which happened to be a.png's initialForm.artist) and submitting while b.png's inspect is in flight
    // must diff against EMPTY_FORM (sending artist: "Ada") and must not send a.png's fieldsToRemove.
    fireEvent.change(screen.getByLabelText(en.toolSettings["edit-metadata"].artist), {
      target: { value: "Ada" },
    });
    fireEvent.click(screen.getByTestId("edit-metadata-submit"));
    expect(FakeXhr.instances).toHaveLength(1);
    const inFlightFormData = FakeXhr.instances[0].sentBody as FormData;
    expect(JSON.parse(String(inFlightFormData.get("settings")))).toEqual({
      artist: "Ada",
    });
    act(() => {
      FakeXhr.instances[0].onerror?.();
    });

    // 3. Switch back to cached a.png, re-mark "Make" for removal, then switch to b.png and let b.png's inspect fail.
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });
    expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue("Ada");
    fireEvent.click(
      screen.getByRole("button", { name: en.toolSettings["edit-metadata"].allMetadata }),
    );
    fireEvent.click(screen.getByRole("button", { name: /^EXIF\d/ }));
    fireEvent.click(
      screen.getByTitle(en.commonUi.metadataGrid.removeField.replace("{field}", "Camera Make")),
    );
    expect(screen.getByText(/1 removed/i)).toBeInTheDocument();

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(pending).toHaveLength(3);
    expect(screen.queryByText(/removed/i)).not.toBeInTheDocument();

    // Edit a field while b.png's inspect is in flight, then let b.png's inspect fail and confirm catch resets the form and keeps fieldsToRemove empty.
    fireEvent.change(screen.getByLabelText(en.toolSettings["edit-metadata"].artist), {
      target: { value: "InFlightEdit" },
    });
    expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue(
      "InFlightEdit",
    );

    await act(async () => {
      pending[2].res.resolve(
        new Response(JSON.stringify({ error: "Inspect failed" }), { status: 500 }),
      );
    });
    expect(screen.getByText("Inspect failed")).toBeInTheDocument();
    expect(screen.getByLabelText(en.toolSettings["edit-metadata"].artist)).toHaveValue("");
    expect(screen.queryByText(/removed/i)).not.toBeInTheDocument();

    // Non-Error rejection and empty Error("") message fall back to t.toolSettings["edit-metadata"].inspectFailed
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(pending).toHaveLength(4);
    await act(async () => {
      pending[3].res.reject("string inspect failure");
    });
    expect(screen.getByText(en.toolSettings["edit-metadata"].inspectFailed)).toBeInTheDocument();

    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });
    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(pending).toHaveLength(5);
    await act(async () => {
      pending[4].res.reject(new Error("   "));
    });
    expect(screen.getByText(en.toolSettings["edit-metadata"].inspectFailed)).toBeInTheDocument();

    unmount();
  });
});
