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

import { BeautifySettings } from "@/components/tools/beautify-settings";
import { ColorPaletteSettings } from "@/components/tools/color-palette-settings";
import { CompareSettings } from "@/components/tools/compare-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
import { InfoSettings } from "@/components/tools/info-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
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
  send() {}
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
      expect(useFileStore.getState().entries[0].processedSize).toBeNull();

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
      expect(entries[1].status).toBe("completed");
      expect(entries[1].processedUrl).toBe("/api/v1/download/j/b.png");
      expect(entries[1].processedSize).toBeNull();
      expect(entries[1].error).toBeNull();
      expect(entries[2].status).toBe("failed");
      expect(entries[2].processedUrl).toBeNull();
      expect(entries[2].error).toBe(en.errors.invalidServerResponse);
      unmount();
    }
  });
});
