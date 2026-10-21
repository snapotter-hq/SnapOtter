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
import { CompareSettings } from "@/components/tools/compare-settings";
import { ComposeSettings } from "@/components/tools/compose-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { WatermarkImageSettings } from "@/components/tools/watermark-image-settings";
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
  url = "";
  body: FormData | null = null;

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(_key: string, _value: string) {}

  send(body: FormData) {
    this.body = body;
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

function chooseSecondaryFile(container: HTMLElement, file: File) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement | null;
  expect(input).not.toBeNull();
  fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
}

function swallowNavigation(e: Event) {
  if ((e.target as Element | null)?.closest?.("a")) {
    e.preventDefault();
  }
}

describe("self-posting tool panels: upload selected entry and land result by captured id (#2681)", () => {
  beforeEach(() => {
    FakeXhr.instances = [];
    vi.stubGlobal("XMLHttpRequest", FakeXhr);
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL: vi.fn((blob: Blob) => `blob:${(blob as File).name ?? "mock"}`),
      revokeObjectURL: vi.fn(),
    });
    document.addEventListener("click", swallowNavigation, true);
    useFileStore.getState().reset();
  });

  afterEach(() => {
    document.removeEventListener("click", swallowNavigation, true);
    cleanup();
    useFileStore.getState().reset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("compose uploads the selected entry and lands the result on it even if selection moves mid-flight", async () => {
    const fileA = image("a.png", "aaa");
    const fileB = image("b.png", "bbbbbb");
    const overlay = image("overlay.png");
    useFileStore.getState().setFiles([fileA, fileB]);
    useFileStore.getState().updateEntry(0, {
      processedUrl: "/api/v1/download/prior/a.png",
      status: "completed",
    });
    useFileStore.getState().markClaimed(0);
    useFileStore.getState().markClaimed(1);
    useFileStore.getState().setSelectedIndex(1);

    let capturedFormData: FormData | null = null;
    let resolveFetch!: (res: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        capturedFormData = (init?.body as FormData) ?? null;
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }),
    );

    const { container } = render(<ComposeSettings />);
    chooseSecondaryFile(container, overlay);
    fireEvent.click(screen.getByTestId("compose-submit"));

    expect(capturedFormData).not.toBeNull();
    expect((capturedFormData!.get("file") as File).name).toBe("b.png");

    // Switch selection to a.png (index 0) while the compose request is in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            jobId: "job-compose",
            downloadUrl: "/api/v1/download/job-compose/composed.png",
            previewUrl: "/api/v1/download/job-compose/preview.png",
            originalSize: 600,
            processedSize: 450,
          }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    // While a.png (index 0) is selected, b.png's compose download link and sizes are hidden.
    expect(screen.queryByTestId("compose-download")).not.toBeInTheDocument();
    expect(
      screen.queryByText(format(en.toolSettings.compose.originalKb, { size: "0.6" })),
    ).not.toBeInTheDocument();
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("completed");
    expect(entries[0].processedUrl).toBe("/api/v1/download/prior/a.png");
    expect(entries[0].claimed).toBe(true);
    expect(useFileStore.getState().processedUrl).toBe("/api/v1/download/prior/a.png");
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("/api/v1/download/job-compose/composed.png");
    expect(entries[1].processedPreviewUrl).toBe("/api/v1/download/job-compose/preview.png");
    expect(entries[1].originalSize).toBe(600);
    expect(entries[1].processedSize).toBe(450);
    expect(entries[1].claimed).toBe(false);

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(useFileStore.getState().processedUrl).toBe("/api/v1/download/job-compose/composed.png");
    expect(useFileStore.getState().originalSize).toBe(600);
    expect(useFileStore.getState().processedSize).toBe(450);
    expect(screen.getByTestId("compose-download")).toHaveAttribute(
      "href",
      "/api/v1/download/job-compose/composed.png",
    );
    expect(
      screen.getByText(format(en.toolSettings.compose.originalKb, { size: "0.6" })),
    ).toBeInTheDocument();
    expect(
      screen.getByText(format(en.toolSettings.compose.processedKb, { size: "0.4" })),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("compose-download"));
    expect(useFileStore.getState().entries[1].claimed).toBe(true);
  });

  it("compare uploads the selected entry and lands the second-image slider URL on it even if selection moves mid-flight", async () => {
    const fileA = image("a.png");
    const fileB = image("b.png");
    const second = image("second.png");
    useFileStore.getState().setFiles([fileA, fileB]);
    useFileStore.getState().setSelectedIndex(1);

    let capturedFormData: FormData | null = null;
    let resolveFetch!: (res: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        capturedFormData = (init?.body as FormData) ?? null;
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }),
    );

    const { container } = render(<CompareSettings />);
    chooseSecondaryFile(container, second);
    fireEvent.click(screen.getByTestId("compare-submit"));

    expect(capturedFormData).not.toBeNull();
    const uploadedFiles = capturedFormData!.getAll("file") as File[];
    expect(uploadedFiles.map((f) => f.name)).toEqual(["b.png", "second.png"]);

    // Switch selection to a.png (index 0) while the compare request is in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            similarity: 94.2,
            downloadUrl: "/api/v1/download/job-compare/diff.png",
          }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.queryByTestId("compare-download")).not.toBeInTheDocument();
    expect(
      screen.queryByText(format(en.toolSettings.compare.similarity, { percent: "94.2" })),
    ).not.toBeInTheDocument();
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].processedUrl).toBeNull();
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("blob:second.png");

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(screen.getByTestId("compare-download")).toHaveAttribute(
      "href",
      "/api/v1/download/job-compare/diff.png",
    );
    expect(
      screen.getByText(format(en.toolSettings.compare.similarity, { percent: "94.2" })),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("compare-download"));
    expect(useFileStore.getState().entries[1].claimed).toBe(true);
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("beautify image-background uploads the selected entry and lands the result on it even if selection moves mid-flight", async () => {
    const fileA = image("a.png");
    const fileB = image("b.png");
    const bgFile = image("bg.png");
    useFileStore.getState().setFiles([fileA, fileB]);
    useFileStore.getState().setSelectedIndex(1);

    let capturedFormData: FormData | null = null;
    let resolveFetch!: (res: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        capturedFormData = (init?.body as FormData) ?? null;
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }),
    );

    const { container } = render(<BeautifySettings />);
    fireEvent.click(screen.getByRole("button", { name: en.toolSettings.beautify.bgImage }));
    chooseSecondaryFile(container, bgFile);
    fireEvent.click(screen.getByTestId("beautify-submit"));

    expect(capturedFormData).not.toBeNull();
    expect((capturedFormData!.get("file") as File).name).toBe("b.png");

    // Switch selection to a.png (index 0) while the beautify request is in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            jobId: "job-beautify",
            downloadUrl: "/api/v1/download/job-beautify/beautified.png",
            originalSize: 800,
            processedSize: 700,
          }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.queryByTestId("beautify-download")).not.toBeInTheDocument();
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].processedUrl).toBeNull();
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("/api/v1/download/job-beautify/beautified.png");
    expect(entries[1].originalSize).toBe(800);
    expect(entries[1].processedSize).toBe(700);

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(screen.getByTestId("beautify-download")).toHaveAttribute(
      "href",
      "/api/v1/download/job-beautify/beautified.png",
    );
    fireEvent.click(screen.getByTestId("beautify-download"));
    expect(useFileStore.getState().entries[1].claimed).toBe(true);
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("watermark-image single-file branch lands the result on the captured entry when a second file is added and selected mid-flight", async () => {
    const fileA = image("a.png");
    const fileB = image("b.png");
    const mark = image("mark.png");
    useFileStore.getState().setFiles([fileA]);

    let capturedFormData: FormData | null = null;
    let resolveFetch!: (res: Response) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        capturedFormData = (init?.body as FormData) ?? null;
        return new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        });
      }),
    );

    const { container } = render(<WatermarkImageSettings />);
    chooseSecondaryFile(container, mark);
    fireEvent.click(screen.getByTestId("watermark-image-submit"));

    expect(capturedFormData).not.toBeNull();
    expect((capturedFormData!.get("file") as File).name).toBe("a.png");

    // Add a second file and select it while the single-file request is in flight.
    act(() => {
      useFileStore.getState().addFiles([fileB]);
      useFileStore.getState().setSelectedIndex(1);
    });

    await act(async () => {
      resolveFetch(
        new Response(
          JSON.stringify({
            jobId: "job-wm",
            downloadUrl: "/api/v1/download/job-wm/watermarked.png",
            originalSize: 500,
            processedSize: 520,
          }),
          { status: 200 },
        ),
      );
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.queryByTestId("watermark-image-download")).not.toBeInTheDocument();
    expect(
      screen.queryByText(format(en.toolSettings["watermark-image"].originalKb, { size: "0.5" })),
    ).not.toBeInTheDocument();
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("completed");
    expect(entries[0].processedUrl).toBe("/api/v1/download/job-wm/watermarked.png");
    expect(entries[0].originalSize).toBe(500);
    expect(entries[0].processedSize).toBe(520);
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("pending");
    expect(entries[1].processedUrl).toBeNull();

    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });
    expect(screen.getByTestId("watermark-image-download")).toHaveAttribute(
      "href",
      "/api/v1/download/job-wm/watermarked.png",
    );
    expect(
      screen.getByText(format(en.toolSettings["watermark-image"].originalKb, { size: "0.5" })),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("watermark-image-download"));
    expect(useFileStore.getState().entries[0].claimed).toBe(true);
    expect(useFileStore.getState().entries[1].claimed).toBe(false);
  });

  it("stitch lands the result on the entry selected at submit time even if selection moves mid-flight", async () => {
    const fileA = image("a.png");
    const fileB = image("b.png");
    useFileStore.getState().setFiles([fileA, fileB]);
    useFileStore.getState().setSelectedIndex(1);

    render(<StitchSettings />);
    fireEvent.click(screen.getByTestId("stitch-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    // Switch selection to a.png (index 0) while the stitch request is in flight.
    act(() => {
      useFileStore.getState().setSelectedIndex(0);
    });

    FakeXhr.instances[0].respond(200, {
      jobId: "job-stitch",
      downloadUrl: "/api/v1/download/job-stitch/stitched.png",
      originalSize: 1200,
      processedSize: 950,
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.queryByTestId("stitch-download")).not.toBeInTheDocument();
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().processedUrl).toBeNull();
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("/api/v1/download/job-stitch/stitched.png");
    expect(entries[1].originalSize).toBe(1200);
    expect(entries[1].processedSize).toBe(950);

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(screen.getByTestId("stitch-download")).toHaveAttribute(
      "href",
      "/api/v1/download/job-stitch/stitched.png",
    );
    fireEvent.click(screen.getByTestId("stitch-download"));
    expect(useFileStore.getState().entries[1].claimed).toBe(true);
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("stitch lands the result on the captured entry when files are reordered and selection moves mid-flight", async () => {
    const fileA = image("a.png");
    const fileB = image("b.png");
    useFileStore.getState().setFiles([fileA, fileB]);

    render(<StitchSettings />);
    fireEvent.click(screen.getByTestId("stitch-submit"));
    await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));

    // Reorder [a.png, b.png] -> [b.png, a.png] and select index 0 (b.png) while in flight.
    act(() => {
      useFileStore.getState().reorderFiles(0, 1);
      useFileStore.getState().setSelectedIndex(0);
    });

    FakeXhr.instances[0].respond(200, {
      jobId: "job-stitch-reorder",
      downloadUrl: "/api/v1/download/job-stitch-reorder/stitched.png",
      originalSize: 1400,
      processedSize: 1100,
    });

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(screen.queryByTestId("stitch-download")).not.toBeInTheDocument();
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("b.png");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].processedUrl).toBeNull();
    expect(entries[1].file.name).toBe("a.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("/api/v1/download/job-stitch-reorder/stitched.png");
    expect(entries[1].originalSize).toBe(1400);
    expect(entries[1].processedSize).toBe(1100);

    act(() => {
      useFileStore.getState().setSelectedIndex(1);
    });
    expect(screen.getByTestId("stitch-download")).toHaveAttribute(
      "href",
      "/api/v1/download/job-stitch-reorder/stitched.png",
    );
    fireEvent.click(screen.getByTestId("stitch-download"));
    expect(useFileStore.getState().entries[1].claimed).toBe(true);
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
  });

  it("clears prior entry processedUrl, processedPreviewUrl, processedSize, and completed status when a re-run fails across all five panels (#2731)", async () => {
    // 1. ComposeSettings (including undoProcessing hiding local readout and failed re-run clearing entry)
    {
      const fileA = image("a.png");
      const fileB = image("b.png");
      const overlay = image("overlay.png");
      useFileStore.getState().setFiles([fileA, fileB]);
      useFileStore.getState().updateEntry(0, {
        processedUrl: "/api/v1/download/compose-a/a.png",
        status: "completed",
      });
      useFileStore.getState().setSelectedIndex(1);

      let call = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          call++;
          if (call <= 2) {
            return new Response(
              JSON.stringify({
                jobId: `job-compose-${call}`,
                downloadUrl: `/api/v1/download/job-compose-${call}/composed.png`,
                previewUrl: `/api/v1/download/job-compose-${call}/preview.png`,
                originalSize: 600,
                processedSize: 450,
              }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ error: "Compose re-run failed" }), { status: 500 });
        }),
      );

      const { container, unmount } = render(<ComposeSettings />);
      chooseSecondaryFile(container, overlay);
      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(screen.getByTestId("compose-download")).toBeInTheDocument());
      expect(useFileStore.getState().entries[1].processedUrl).toBe(
        "/api/v1/download/job-compose-1/composed.png",
      );
      expect(useFileStore.getState().entries[1].status).toBe("completed");

      // Calling undoProcessing() clears currentEntry.processedUrl and hides the local download link and sizes.
      act(() => {
        useFileStore.getState().undoProcessing();
      });
      expect(screen.queryByTestId("compose-download")).not.toBeInTheDocument();
      expect(
        screen.queryByText(format(en.toolSettings.compose.originalKb, { size: "0.6" })),
      ).not.toBeInTheDocument();

      // Seed entry A again, re-run b.png to completion, then fail on the next re-run.
      act(() => {
        useFileStore.getState().updateEntry(0, {
          processedUrl: "/api/v1/download/compose-a/a.png",
          status: "completed",
        });
      });
      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(screen.getByTestId("compose-download")).toBeInTheDocument());

      // Re-run on b.png and fail.
      fireEvent.click(screen.getByTestId("compose-submit"));
      await waitFor(() => expect(screen.getByText("Compose re-run failed")).toBeInTheDocument());
      expect(screen.queryByTestId("compose-download")).not.toBeInTheDocument();
      expect(
        screen.queryByText(format(en.toolSettings.compose.originalKb, { size: "0.6" })),
      ).not.toBeInTheDocument();
      const entryB = useFileStore.getState().entries[1];
      expect(entryB.processedUrl).toBeNull();
      expect(entryB.processedPreviewUrl).toBeNull();
      expect(entryB.processedSize).toBeNull();
      expect(entryB.status).toBe("pending");
      // Bystander entry A is untouched.
      expect(useFileStore.getState().entries[0].processedUrl).toBe(
        "/api/v1/download/compose-a/a.png",
      );
      unmount();
    }

    // 2. CompareSettings
    {
      useFileStore.getState().reset();
      const fileA = image("a.png");
      const second = image("second.png");
      useFileStore.getState().setFiles([fileA]);

      let call = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          call++;
          if (call === 1) {
            return new Response(
              JSON.stringify({
                similarity: 88.4,
                downloadUrl: "/api/v1/download/job-compare-1/diff.png",
              }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ error: "Compare re-run failed" }), { status: 500 });
        }),
      );

      const { container, unmount } = render(<CompareSettings />);
      chooseSecondaryFile(container, second);
      fireEvent.click(screen.getByTestId("compare-submit"));
      await waitFor(() => expect(screen.getByTestId("compare-download")).toBeInTheDocument());
      expect(useFileStore.getState().entries[0].processedUrl).toBe("blob:second.png");
      expect(useFileStore.getState().entries[0].status).toBe("completed");

      fireEvent.click(screen.getByTestId("compare-submit"));
      await waitFor(() => expect(screen.getByText("Compare re-run failed")).toBeInTheDocument());
      expect(screen.queryByTestId("compare-download")).not.toBeInTheDocument();
      expect(
        screen.queryByText(format(en.toolSettings.compare.similarity, { percent: "88.4" })),
      ).not.toBeInTheDocument();
      const entryA = useFileStore.getState().entries[0];
      expect(entryA.processedUrl).toBeNull();
      expect(entryA.status).toBe("pending");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:second.png");
      unmount();
    }

    // 3. WatermarkImageSettings (single-file branch, then multi-file batch branch)
    {
      useFileStore.getState().reset();
      const fileA = image("a.png");
      const fileB = image("b.png");
      const mark = image("mark.png");
      useFileStore.getState().setFiles([fileA]);

      let call = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          call++;
          if (call === 1) {
            return new Response(
              JSON.stringify({
                jobId: "job-wm-1",
                downloadUrl: "/api/v1/download/job-wm-1/wm.png",
                previewUrl: "/api/v1/download/job-wm-1/preview.png",
                originalSize: 500,
                processedSize: 510,
              }),
              { status: 200 },
            );
          }
          if (call === 2) {
            return new Response(JSON.stringify({ error: "Watermark re-run failed" }), {
              status: 500,
            });
          }
          if (call === 3) {
            return new Response(
              JSON.stringify({
                jobId: "job-wm-2",
                downloadUrl: "/api/v1/download/job-wm-2/wm.png",
                previewUrl: "/api/v1/download/job-wm-2/preview.png",
                originalSize: 500,
                processedSize: 510,
              }),
              { status: 200 },
            );
          }
          if (call === 4) {
            return new Response(
              JSON.stringify({
                jobId: "job-wm-batch-a",
                downloadUrl: "/api/v1/download/job-wm-batch-a/a.png",
                originalSize: 500,
                processedSize: 480,
              }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ error: "Watermark batch item failed" }), {
            status: 500,
          });
        }),
      );

      const { container, unmount } = render(<WatermarkImageSettings />);
      chooseSecondaryFile(container, mark);
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() =>
        expect(screen.getByTestId("watermark-image-download")).toBeInTheDocument(),
      );
      expect(useFileStore.getState().entries[0].processedUrl).toBe(
        "/api/v1/download/job-wm-1/wm.png",
      );

      // Single-file failed re-run clears entry[0].
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(screen.getByText("Watermark re-run failed")).toBeInTheDocument());
      expect(screen.queryByTestId("watermark-image-download")).not.toBeInTheDocument();
      expect(
        screen.queryByText(format(en.toolSettings["watermark-image"].originalKb, { size: "0.5" })),
      ).not.toBeInTheDocument();
      expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
      expect(useFileStore.getState().entries[0].processedPreviewUrl).toBeNull();
      expect(useFileStore.getState().entries[0].processedSize).toBeNull();
      expect(useFileStore.getState().entries[0].status).toBe("pending");

      // Succeed again on single file, then add fileB and run multi-file batch where a.png succeeds and b.png fails.
      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() =>
        expect(screen.getByTestId("watermark-image-download")).toBeInTheDocument(),
      );
      act(() => {
        useFileStore.getState().addFiles([fileB]);
        useFileStore.getState().updateEntry(1, {
          processedUrl: "blob:prior-b",
          processedPreviewUrl: "blob:prior-b-preview",
          processedSize: 410,
          status: "completed",
        });
      });

      fireEvent.click(screen.getByTestId("watermark-image-submit"));
      await waitFor(() => expect(useFileStore.getState().processing).toBe(false));

      const entriesAfterBatch = useFileStore.getState().entries;
      expect(entriesAfterBatch[0].status).toBe("completed");
      expect(entriesAfterBatch[0].processedUrl).toBe("/api/v1/download/job-wm-batch-a/a.png");
      expect(screen.getByTestId("watermark-image-download")).toHaveAttribute(
        "href",
        "/api/v1/download/job-wm-batch-a/a.png",
      );
      expect(entriesAfterBatch[1].processedUrl).toBeNull();
      expect(entriesAfterBatch[1].processedPreviewUrl).toBeNull();
      expect(entriesAfterBatch[1].processedSize).toBeNull();
      expect(entriesAfterBatch[1].status).toBe("failed");
      expect(entriesAfterBatch[1].error).toBe("Watermark batch item failed");
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:prior-b");
      unmount();
    }

    // 4. BeautifySettings (image-background branch and fallback to useToolProcessor)
    {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      const fileA = image("a.png");
      const bgFile = image("bg.png");
      useFileStore.getState().setFiles([fileA]);

      let call = 0;
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          call++;
          if (call === 1 || call === 3) {
            return new Response(
              JSON.stringify({
                jobId: `job-b-${call}`,
                downloadUrl: `/api/v1/download/job-b-${call}/beautified.png`,
                previewUrl: `/api/v1/download/job-b-${call}/preview.png`,
                originalSize: 800,
                processedSize: 700,
              }),
              { status: 200 },
            );
          }
          return new Response(JSON.stringify({ error: "Beautify re-run failed" }), { status: 500 });
        }),
      );

      const { container, unmount } = render(<BeautifySettings />);
      fireEvent.click(screen.getByRole("button", { name: en.toolSettings.beautify.bgImage }));
      chooseSecondaryFile(container, bgFile);
      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() => expect(screen.getByTestId("beautify-download")).toBeInTheDocument());
      expect(useFileStore.getState().entries[0].processedUrl).toBe(
        "/api/v1/download/job-b-1/beautified.png",
      );

      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() => expect(screen.getByText("Beautify re-run failed")).toBeInTheDocument());
      expect(screen.queryByTestId("beautify-download")).not.toBeInTheDocument();
      const entryA = useFileStore.getState().entries[0];
      expect(entryA.processedUrl).toBeNull();
      expect(entryA.processedPreviewUrl).toBeNull();
      expect(entryA.processedSize).toBeNull();
      expect(entryA.status).toBe("pending");

      // Succeed on image-background again, then switch to gradient background and run via useToolProcessor:
      // manualDownloadByEntry is cleared so the standard run's downloadUrl is shown instead of the stale manual URL.
      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() =>
        expect(screen.getByTestId("beautify-download")).toHaveAttribute(
          "href",
          "/api/v1/download/job-b-3/beautified.png",
        ),
      );
      fireEvent.click(screen.getByRole("button", { name: en.toolSettings.beautify.bgGradient }));
      fireEvent.click(screen.getByTestId("beautify-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
      FakeXhr.instances[0].respond(200, {
        jobId: "job-b-std",
        downloadUrl: "/api/v1/download/job-b-std/gradient.png",
        originalSize: 800,
        processedSize: 650,
      });
      await waitFor(() =>
        expect(screen.getByTestId("beautify-download")).toHaveAttribute(
          "href",
          "/api/v1/download/job-b-std/gradient.png",
        ),
      );
      unmount();
    }

    // 5. StitchSettings (including re-run after switching selectedIndex)
    {
      FakeXhr.instances = [];
      useFileStore.getState().reset();
      const fileA = image("a.png");
      const fileB = image("b.png");
      useFileStore.getState().setFiles([fileA, fileB]);

      const { unmount } = render(<StitchSettings />);
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
      FakeXhr.instances[0].respond(200, {
        jobId: "job-stitch-1",
        downloadUrl: "/api/v1/download/job-stitch-1/stitched.png",
        originalSize: 1200,
        processedSize: 950,
      });
      await waitFor(() => expect(screen.getByTestId("stitch-download")).toBeInTheDocument());
      expect(useFileStore.getState().entries[0].processedUrl).toBe(
        "/api/v1/download/job-stitch-1/stitched.png",
      );

      // Select b.png (index 1) and re-run Stitch when the second run fails: both entries are cleared.
      act(() => {
        useFileStore.getState().setSelectedIndex(1);
      });
      fireEvent.click(screen.getByTestId("stitch-submit"));
      await waitFor(() => expect(FakeXhr.instances).toHaveLength(2));
      FakeXhr.instances[1].respond(500, { error: "Stitch re-run failed" });
      await waitFor(() => expect(screen.getByText("Stitch re-run failed")).toBeInTheDocument());
      expect(screen.queryByTestId("stitch-download")).not.toBeInTheDocument();
      const entryA = useFileStore.getState().entries[0];
      expect(entryA.processedUrl).toBeNull();
      expect(entryA.processedPreviewUrl).toBeNull();
      expect(entryA.processedSize).toBeNull();
      expect(entryA.status).toBe("pending");
      act(() => {
        useFileStore.getState().setSelectedIndex(0);
      });
      expect(screen.queryByTestId("stitch-download")).not.toBeInTheDocument();
      unmount();
    }
  });
});
