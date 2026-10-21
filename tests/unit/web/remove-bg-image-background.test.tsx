// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({
  processFiles: vi.fn(),
  processAllFiles: vi.fn(),
  downloadUrl: null as string | null,
}));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: processor.processFiles,
    processAllFiles: processor.processAllFiles,
    processing: false,
    error: null,
    downloadUrl: processor.downloadUrl,
    originalSize: null,
    processedSize: null,
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { PipelineStepSettings } from "@/components/tools/pipeline-step-settings";
import {
  RemoveBgControls,
  RemoveBgPipelineControls,
  RemoveBgSettings,
} from "@/components/tools/remove-bg-settings";
import { RemoveGifBackgroundSettings } from "@/components/tools/remove-gif-background-settings";
import { useFileStore } from "@/stores/file-store";

const imageLabel = en.toolSettings["remove-bg"].image;
const gifImageLabel = en.toolSettings["remove-gif-background"].bgImage;
const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });
const gif = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/gif" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  processor.processFiles.mockClear();
  processor.processAllFiles.mockClear();
  processor.downloadUrl = null;
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.getState().setFiles([]);
});

// Pipelines and multi-file runs cannot carry an uploaded background image, so
// the server answers 400 for backgroundType "image" there (#1047). The UI must
// not offer it (#2074).
describe("remove-background image background option (#2074)", () => {
  it("offers the Image background by default", () => {
    render(<RemoveBgControls settings={{}} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: imageLabel })).toBeInTheDocument();
  });

  it("hides it when allowImageBackground is false", () => {
    render(<RemoveBgControls settings={{}} onChange={() => {}} allowImageBackground={false} />);
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.toolSettings["remove-bg"].color })).toBeVisible();
  });

  it("hides it in a pipeline step", () => {
    render(<RemoveBgPipelineControls settings={{}} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
  });

  it("emits transparent for a stored image background it cannot offer", () => {
    const onChange = vi.fn();
    render(<RemoveBgPipelineControls settings={{ backgroundType: "image" }} onChange={onChange} />);
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.backgroundType).toBe("transparent");
  });

  it("keeps a stored image background when it is allowed", () => {
    const onChange = vi.fn();
    render(<RemoveBgControls settings={{ backgroundType: "image" }} onChange={onChange} />);
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.backgroundType).toBe("image");
  });

  it("offers it on the tool page for one file and hides it for several", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    const { unmount } = render(<RemoveBgSettings />);
    expect(screen.getByRole("button", { name: imageLabel })).toBeInTheDocument();
    unmount();

    useFileStore.getState().setFiles([png("a.png"), png("b.png")]);
    render(<RemoveBgSettings />);
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
  });

  it("registers the pipeline step with the controls that hide it", async () => {
    const onChange = vi.fn();
    render(
      <PipelineStepSettings
        toolId="remove-background"
        settings={{ backgroundType: "image" }}
        onChange={onChange}
      />,
    );
    await screen.findByRole("button", { name: en.toolSettings["remove-bg"].color });
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.backgroundType).toBe("transparent");
  });

  it("follows the file count on a mounted page and never sends image for several files", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    render(<RemoveBgSettings />);
    fireEvent.click(screen.getByRole("button", { name: imageLabel }));

    act(() => useFileStore.getState().setFiles([png("a.png"), png("b.png")]));
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("remove-background-submit"));
    const sent = processor.processAllFiles.mock.calls[0][1] as Record<string, unknown>;
    expect(sent.backgroundType).toBe("transparent");
    expect(sent._bgImageFile).toBeUndefined();

    act(() => useFileStore.getState().setFiles([png("a.png")]));
    expect(screen.getByRole("button", { name: imageLabel })).toBeInTheDocument();
  });
});

describe("remove-gif-background image background option (#3005)", () => {
  it("offers the Image background for one file and hides it for several", () => {
    useFileStore.getState().setFiles([gif("a.gif")]);
    const { unmount } = render(<RemoveGifBackgroundSettings />);
    expect(screen.getByRole("button", { name: gifImageLabel })).toBeInTheDocument();
    unmount();

    useFileStore.getState().setFiles([gif("a.gif"), gif("b.gif")]);
    render(<RemoveGifBackgroundSettings />);
    expect(screen.queryByRole("button", { name: gifImageLabel })).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: en.toolSettings["remove-gif-background"].bgColor }),
    ).toBeVisible();
  });

  it("follows the file count on a mounted page and never sends image for several files", () => {
    useFileStore.getState().setFiles([gif("a.gif")]);
    render(<RemoveGifBackgroundSettings />);
    fireEvent.click(screen.getByRole("button", { name: gifImageLabel }));

    const submitBtn = screen.getByTestId("remove-gif-background-submit");
    expect(submitBtn).toBeDisabled();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    const bgFile = png("bg.png");
    fireEvent.change(fileInput, { target: { files: [bgFile] } });
    expect(submitBtn).toBeEnabled();

    act(() => useFileStore.getState().setFiles([gif("a.gif"), gif("b.gif")]));
    expect(screen.queryByRole("button", { name: gifImageLabel })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "bg.png" })).not.toBeInTheDocument();
    expect(submitBtn).toBeEnabled();

    fireEvent.click(submitBtn);
    const sent = processor.processAllFiles.mock.calls[0][1] as Record<string, unknown>;
    expect(sent.backgroundType).toBe("transparent");
    expect(sent._bgImageFile).toBeUndefined();

    act(() => useFileStore.getState().setFiles([gif("a.gif")]));
    expect(screen.getByRole("button", { name: gifImageLabel })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("remove-gif-background-submit"));
    const singleSent = processor.processFiles.mock.calls[0][1] as Record<string, unknown>;
    expect(singleSent.backgroundType).toBe("image");
    expect(singleSent._bgImageFile).toBe(bgFile);
  });
});

describe("remove-background incomplete image and invalid color validation (#2280)", () => {
  it("disables Download and shows a hint when Image background has no file, then enables once chosen", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    processor.downloadUrl = "/api/v1/download/JOB123/a_mask.png";
    useFileStore.getState().setFiles([png("a.png")]);

    render(<RemoveBgSettings />);
    await screen.findByTestId("remove-background-download");

    fireEvent.click(screen.getByRole("button", { name: imageLabel }));

    const downloadBtn = await screen.findByTestId("remove-background-download-effects");
    expect(downloadBtn).toBeDisabled();
    expect(
      screen.getByText(en.toolSettings["remove-background"].backgroundImageRequired),
    ).toBeVisible();

    fireEvent.click(downloadBtn);
    expect(fetchSpy).not.toHaveBeenCalled();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [png("bg.png")] } });

    expect(
      screen.queryByText(en.toolSettings["remove-background"].backgroundImageRequired),
    ).toBeNull();
    expect(downloadBtn).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].remove }));
    expect(
      screen.getByText(en.toolSettings["remove-background"].backgroundImageRequired),
    ).toBeVisible();
    expect(downloadBtn).toBeDisabled();
  });

  it("disables Submit before Phase 1 when Image background has no file or Color is invalid", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    render(<RemoveBgSettings />);

    const submitBtn = screen.getByTestId("remove-background-submit");
    expect(submitBtn).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: imageLabel }));
    expect(submitBtn).toBeDisabled();

    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [png("bg.png")] } });
    expect(submitBtn).toBeEnabled();

    // Switching to Color and typing an invalid hex also disables Phase 1 Submit
    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].color }));
    const colorInput = screen.getByPlaceholderText("#FF5500");
    fireEvent.change(colorInput, { target: { value: "#FF" } });
    expect(submitBtn).toBeDisabled();

    // Switching away to Transparent while bgColor holds "#FF" must not crash and re-enables Submit
    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].transparent }));
    expect(submitBtn).toBeEnabled();
  });

  it("validates the free-text color input, disables Download/Rerun on invalid hex, and normalizes CSS preview", async () => {
    const onBgPreview = vi.fn();
    processor.downloadUrl = "/api/v1/download/JOB123/a_mask.png";
    useFileStore.getState().setFiles([png("a.png")]);

    render(<RemoveBgSettings onBgPreview={onBgPreview} />);
    await screen.findByTestId("remove-background-download");

    // Change Subject so the Phase 2 rerun button appears
    fireEvent.click(
      screen.getByRole("button", { name: en.toolSettings["remove-background"].products }),
    );
    const rerunBtn = screen.getByTestId("remove-background-rerun");

    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].color }));
    const colorInput = screen.getByPlaceholderText("#FF5500");
    const downloadBtn = await screen.findByTestId("remove-background-download-effects");

    // Half-typed hex color (#FF)
    fireEvent.change(colorInput, { target: { value: "#FF" } });
    expect(colorInput).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(en.toolSettings["remove-background"].invalidHexColor)).toBeVisible();
    expect(downloadBtn).toBeDisabled();
    expect(rerunBtn).toBeDisabled();
    expect(onBgPreview).toHaveBeenLastCalledWith({ showCheckerboard: true });

    // Empty string (must not fall back to #FFFFFF and look valid)
    fireEvent.change(colorInput, { target: { value: "" } });
    expect(colorInput).toHaveAttribute("aria-invalid", "true");
    expect(downloadBtn).toBeDisabled();
    expect(rerunBtn).toBeDisabled();
    expect(onBgPreview).toHaveBeenLastCalledWith({ showCheckerboard: true });

    // Valid 3-digit shorthand and hashless 6-digit hex accepted by HEX_COLOR_PATTERN
    fireEvent.change(colorInput, { target: { value: "FF5500" } });
    expect(colorInput).toHaveAttribute("aria-invalid", "false");
    expect(screen.queryByText(en.toolSettings["remove-background"].invalidHexColor)).toBeNull();
    expect(downloadBtn).toBeEnabled();
    expect(rerunBtn).toBeEnabled();
    expect(onBgPreview).toHaveBeenLastCalledWith({ containerBackground: "#ff5500" });

    fireEvent.change(colorInput, { target: { value: "#F50" } });
    expect(colorInput).toHaveAttribute("aria-invalid", "false");
    expect(downloadBtn).toBeEnabled();
    expect(onBgPreview).toHaveBeenLastCalledWith({ containerBackground: "#ff5500" });

    // Surrounding whitespace is trimmed just like the server's hexColor schema
    fireEvent.change(colorInput, { target: { value: " #00AAFF " } });
    expect(colorInput).toHaveAttribute("aria-invalid", "false");
    expect(downloadBtn).toBeEnabled();
    expect(onBgPreview).toHaveBeenLastCalledWith({ containerBackground: "#00aaff" });
  });

  it.each([
    { gradientColor1: "not-hex", gradientColor2: "#764ba2" },
    { gradientColor1: "#667eea", gradientColor2: "not-hex" },
  ])("shows an inline error when a seeded gradient color is invalid (%o)", (stops) => {
    render(
      <RemoveBgControls
        settings={{
          backgroundType: "gradient",
          ...stops,
        }}
        onChange={() => {}}
      />,
    );
    expect(screen.getByText(en.toolSettings["remove-background"].invalidHexColor)).toBeVisible();
  });
});

describe("remove-background HEIC background preview lifecycle (#3204)", () => {
  const heic = (name = "bg.heic") =>
    new File([new Uint8Array([1, 2, 3])], name, { type: "image/heic" });

  it("aborts an in-flight HEIC preview fetch on unmount and does not create a blob URL if it resolves late", async () => {
    processor.downloadUrl = "/api/v1/download/JOB123/a_mask.png";
    useFileStore.getState().setFiles([png("a.png")]);

    const signals: Array<AbortSignal | undefined> = [];
    let resolvePreview: ((res: Response) => void) | undefined;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolvePreview = resolve;
        });
      }),
    );

    const onBgPreview = vi.fn();
    const { unmount } = render(<RemoveBgSettings onBgPreview={onBgPreview} />);
    await screen.findByTestId("remove-background-download");

    fireEvent.click(screen.getByRole("button", { name: imageLabel }));
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [heic("bg.heic")] } });

    await waitFor(() => expect(resolvePreview).toBeDefined());
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);

    const createCallsBeforeUnmount = vi.mocked(URL.createObjectURL).mock.calls.length;
    unmount();

    expect(signals[0]?.aborted).toBe(true);

    await act(async () => {
      resolvePreview?.(
        new Response("decoded-webp", { status: 200, headers: { "Content-Type": "image/webp" } }),
      );
    });

    expect(URL.createObjectURL).toHaveBeenCalledTimes(createCallsBeforeUnmount);
  });

  it("aborts in-flight HEIC preview fetches on file swap or removal, clears stale preview URLs while decoding, and revokes decoded URLs on cleanup", async () => {
    let urlCounter = 0;
    URL.createObjectURL = vi.fn(() => `blob:mock-${++urlCounter}`);
    processor.downloadUrl = "/api/v1/download/JOB123/a_mask.png";
    useFileStore.getState().setFiles([png("a.png")]);

    const signals: Array<AbortSignal | undefined> = [];
    const resolvers: Array<(res: Response) => void> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        signals.push(init?.signal ?? undefined);
        return new Promise<Response>((resolve) => {
          resolvers.push(resolve);
        });
      }),
    );

    const onBgPreview = vi.fn();
    const { unmount } = render(<RemoveBgSettings onBgPreview={onBgPreview} />);
    await screen.findByTestId("remove-background-download");

    fireEvent.click(screen.getByRole("button", { name: imageLabel }));

    // 1. Pick a HEIC background, then remove it while /api/v1/preview is still in flight
    let fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [heic("first.heic")] } });
    await waitFor(() => expect(signals).toHaveLength(1));
    expect(signals[0]).toBeInstanceOf(AbortSignal);
    expect(signals[0]?.aborted).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].remove }));
    expect(signals[0]?.aborted).toBe(true);

    // 2. Pick a PNG background, then verify a late resolution from first.heic cannot clobber it
    fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [png("bg.png")] } });
    const pngBlobUrl = vi.mocked(URL.createObjectURL).mock.results.at(-1)?.value as string;
    const createCountAfterPng = vi.mocked(URL.createObjectURL).mock.calls.length;
    expect(onBgPreview).toHaveBeenLastCalledWith({ backgroundSrc: pngBlobUrl });

    await act(async () => {
      resolvers[0]?.(
        new Response("stale-heic", { status: 200, headers: { "Content-Type": "image/webp" } }),
      );
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(createCountAfterPng);
    expect(onBgPreview).toHaveBeenLastCalledWith({ backgroundSrc: pngBlobUrl });

    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].remove }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(pngBlobUrl);

    // 3. Pick a HEIF background, then verify switching tabs away from Image aborts the in-flight request
    fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [heic("second.heif")] } });
    await waitFor(() => expect(signals).toHaveLength(2));
    expect(signals[1]).toBeInstanceOf(AbortSignal);
    expect(signals[1]?.aborted).toBe(false);
    // While the HEIF preview is still decoding, the revoked PNG blob URL must not remain active
    expect(onBgPreview).toHaveBeenLastCalledWith({ showCheckerboard: true });

    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].color }));
    expect(signals[1]?.aborted).toBe(true);

    // Switching back to Image re-fetches the retained HEIF background file
    fireEvent.click(screen.getByRole("button", { name: imageLabel }));
    await waitFor(() => expect(signals).toHaveLength(3));
    expect(signals[2]?.aborted).toBe(false);

    // Resolve the HEIF preview and verify the decoded blob URL is applied and later revoked on unmount
    await act(async () => {
      resolvers[2]?.(
        new Response("decoded-webp", { status: 200, headers: { "Content-Type": "image/webp" } }),
      );
    });
    const heifBlobUrl = vi.mocked(URL.createObjectURL).mock.results.at(-1)?.value as string;
    await waitFor(() =>
      expect(onBgPreview).toHaveBeenLastCalledWith({ backgroundSrc: heifBlobUrl }),
    );

    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(heifBlobUrl);
  });

  it("ignores an abort after fetch headers arrive while res.blob() is still streaming, and handles non-200 or rejected preview fetches", async () => {
    processor.downloadUrl = "/api/v1/download/JOB123/a_mask.png";
    useFileStore.getState().setFiles([png("a.png")]);

    let resolveBlob: ((blob: Blob) => void) | undefined;
    let callIndex = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: string, init?: RequestInit) => {
        callIndex += 1;
        if (callIndex === 1) {
          return Promise.resolve({
            ok: true,
            blob: () =>
              new Promise<Blob>((resolve) => {
                resolveBlob = resolve;
              }),
          } as Response);
        }
        if (callIndex === 2) {
          return Promise.resolve(new Response(JSON.stringify({ error: "bad" }), { status: 422 }));
        }
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
          });
        });
      }),
    );

    const onBgPreview = vi.fn();
    const firstView = render(<RemoveBgSettings onBgPreview={onBgPreview} />);
    await screen.findByTestId("remove-background-download");
    fireEvent.click(screen.getByRole("button", { name: imageLabel }));

    // 1. Headers arrive, then component unmounts while res.blob() is still pending
    let fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [heic("streaming.hif")] } });
    await waitFor(() => expect(resolveBlob).toBeDefined());
    const createCountBeforeAbort = vi.mocked(URL.createObjectURL).mock.calls.length;

    firstView.unmount();
    await act(async () => {
      resolveBlob?.(new Blob(["late-body"], { type: "image/webp" }));
    });
    expect(URL.createObjectURL).toHaveBeenCalledTimes(createCountBeforeAbort);

    // 2. Non-200 (422) preview response leaves preview on checkerboard without creating a blob URL
    const { unmount } = render(<RemoveBgSettings onBgPreview={onBgPreview} />);
    await screen.findByTestId("remove-background-download-effects");
    await act(async () => {});
    expect(URL.createObjectURL).toHaveBeenCalledTimes(createCountBeforeAbort);
    expect(onBgPreview).toHaveBeenLastCalledWith({ showCheckerboard: true });

    // 3. AbortError rejection on unmount is swallowed cleanly
    fireEvent.click(screen.getByRole("button", { name: en.toolSettings["remove-bg"].remove }));
    fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, { target: { files: [heic("aborting.heic")] } });
    unmount();
    await act(async () => {});
    expect(URL.createObjectURL).toHaveBeenCalledTimes(createCountBeforeAbort);
  });
});
