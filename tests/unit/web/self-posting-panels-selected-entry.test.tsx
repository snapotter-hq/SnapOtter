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

describe("self-posting tool panels: upload selected entry and land result by captured id (#2681)", () => {
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

    await waitFor(() => expect(screen.getByTestId("compose-download")).toBeInTheDocument());
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

    await waitFor(() => expect(screen.getByTestId("compare-download")).toBeInTheDocument());
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].processedUrl).toBeNull();
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("blob:second.png");
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

    await waitFor(() => expect(screen.getByTestId("beautify-download")).toBeInTheDocument());
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].processedUrl).toBeNull();
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("/api/v1/download/job-beautify/beautified.png");
    expect(entries[1].originalSize).toBe(800);
    expect(entries[1].processedSize).toBe(700);
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

    await waitFor(() => expect(screen.getByTestId("watermark-image-download")).toBeInTheDocument());
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("a.png");
    expect(entries[0].status).toBe("completed");
    expect(entries[0].processedUrl).toBe("/api/v1/download/job-wm/watermarked.png");
    expect(entries[0].originalSize).toBe(500);
    expect(entries[0].processedSize).toBe(520);
    expect(entries[1].file.name).toBe("b.png");
    expect(entries[1].status).toBe("pending");
    expect(entries[1].processedUrl).toBeNull();
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

    await waitFor(() => expect(screen.getByTestId("stitch-download")).toBeInTheDocument());
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

    await waitFor(() => expect(screen.getByTestId("stitch-download")).toBeInTheDocument());
    const { entries } = useFileStore.getState();
    expect(entries[0].file.name).toBe("b.png");
    expect(entries[0].status).toBe("pending");
    expect(entries[0].processedUrl).toBeNull();
    expect(entries[1].file.name).toBe("a.png");
    expect(entries[1].status).toBe("completed");
    expect(entries[1].processedUrl).toBe("/api/v1/download/job-stitch-reorder/stitched.png");
    expect(entries[1].originalSize).toBe(1400);
    expect(entries[1].processedSize).toBe(1100);
  });
});
