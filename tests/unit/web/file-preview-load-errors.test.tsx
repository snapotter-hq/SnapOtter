// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => new Map<string, string>());

vi.mock("@/components/common/waveform-player", () => ({
  WaveformPlayer: ({ src }: { src: string }) => (
    <div data-testid="waveform-player" data-src={src} />
  ),
}));

import { FilePreview } from "@/components/files/file-details";
import { I18nProvider } from "@/contexts/i18n-context";

beforeEach(() => {
  storage.clear();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
    clear: () => storage.clear(),
  });
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: vi.fn(() => "blob:loaded"),
    revokeObjectURL: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  storage.clear();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("FilePreview direct-download error handling (#1346)", () => {
  it.each([
    ["PDF", "application/pdf", "report.pdf", "iframe"],
    ["native video", "video/mp4", "clip.mp4", "video"],
    ["native audio", "audio/mpeg", "track.mp3", '[data-testid="waveform-player"]'],
  ])(
    "shows an error state instead of rendering the error body when %s download returns non-2xx",
    async (_label, mimeType, name, playerSelector) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: false,
          status: 404,
          blob: async () => new Blob(['{"error":"File not found"}'], { type: "application/json" }),
        })),
      );

      const { container } = render(<FilePreview fileId="f1" mimeType={mimeType} name={name} />);

      expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: en.common.retry })).toBeInTheDocument();
      expect(container.querySelector(playerSelector)).toBeNull();
      expect(URL.createObjectURL).not.toHaveBeenCalled();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[file-preview] failed to load file f1"),
        expect.any(Error),
      );
    },
  );

  it.each([
    ["PDF", "application/pdf", "report.pdf"],
    ["native video", "video/mp4", "clip.mp4"],
    ["native audio", "audio/mpeg", "track.mp3"],
  ])(
    "shows an error state instead of spinning forever when %s download rejects with a network error",
    async (_label, mimeType, name) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const networkError = new TypeError("Failed to fetch");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw networkError;
        }),
      );

      const { container } = render(<FilePreview fileId="f1" mimeType={mimeType} name={name} />);

      expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();
      expect(container.querySelector(".animate-spin, .animate-pulse")).toBeNull();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[file-preview] failed to load file f1"),
        networkError,
      );
    },
  );

  it("shows an error state when the response stream fails mid-download (res.blob() rejects)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const streamError = new TypeError("network error reading body");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => {
          throw streamError;
        },
      })),
    );

    const { container } = render(
      <FilePreview fileId="f1" mimeType="application/pdf" name="report.pdf" />,
    );

    expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();
    expect(container.querySelector("iframe")).toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining("[file-preview] failed to load file f1"),
      streamError,
    );
  });

  it("retries loading the file when Retry is clicked after a failure", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let attempts = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        attempts += 1;
        if (attempts === 1) {
          return { ok: false, status: 502, blob: async () => new Blob() };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        };
      }),
    );

    render(<FilePreview fileId="f1" mimeType="application/pdf" name="report.pdf" />);
    expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: en.common.retry }));

    expect(await screen.findByTitle("report.pdf")).toHaveAttribute("src", "blob:loaded");
    expect(screen.queryByText(en.files.details.loadFailed)).toBeNull();
    expect(attempts).toBe(2);
  });

  it("aborts the in-flight download request when switching files or unmounting", async () => {
    const signals: AbortSignal[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn((_input: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        return new Promise(() => {});
      }),
    );

    const view = render(<FilePreview fileId="f1" mimeType="video/mp4" name="first.mp4" />);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    view.rerender(<FilePreview fileId="f2" mimeType="video/mp4" name="second.mp4" />);
    expect(signals[0].aborted).toBe(true);
    expect(signals).toHaveLength(2);
    expect(signals[1].aborted).toBe(false);

    view.unmount();
    expect(signals[1].aborted).toBe(true);
  });

  it("localizes the load failure message in the active locale", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    storage.set("snapotter-locale", "de");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 500,
        blob: async () => new Blob(["error"]),
      })),
    );

    render(
      <I18nProvider>
        <FilePreview fileId="f1" mimeType="application/pdf" name="report.pdf" />
      </I18nProvider>,
    );

    expect(await screen.findByText(de.files.details.loadFailed)).toBeInTheDocument();
    expect(screen.queryByText(en.files.details.loadFailed)).toBeNull();
  });

  it("clears the download error when switching to another file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (String(input).includes("/f1/")) {
          return {
            ok: false,
            status: 500,
            blob: async () => new Blob(["error"]),
          };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
        };
      }),
    );

    const view = render(<FilePreview fileId="f1" mimeType="application/pdf" name="broken.pdf" />);
    expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();

    view.rerender(<FilePreview fileId="f2" mimeType="application/pdf" name="working.pdf" />);

    await waitFor(() => {
      expect(screen.queryByText(en.files.details.loadFailed)).toBeNull();
    });
    expect(await screen.findByTitle("working.pdf")).toHaveAttribute("src", "blob:loaded");
  });

  it("revokes the previous blob URL and shows the error state when switching from a loaded file to a failing one", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (String(input).includes("/f1/")) {
          return {
            ok: true,
            status: 200,
            blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
          };
        }
        return {
          ok: false,
          status: 404,
          blob: async () => new Blob(["missing"]),
        };
      }),
    );

    const view = render(<FilePreview fileId="f1" mimeType="application/pdf" name="working.pdf" />);
    expect(await screen.findByTitle("working.pdf")).toHaveAttribute("src", "blob:loaded");

    view.rerender(<FilePreview fileId="f2" mimeType="application/pdf" name="broken.pdf" />);

    expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();
    expect(view.container.querySelector("iframe")).toBeNull();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:loaded");
  });

  it("ignores a late failure from the previous file after switching files", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let rejectFirst: (err: Error) => void = () => {};
    let rejectSecond: (err: Error) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (String(input).includes("/f1/")) {
          return new Promise((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        return new Promise((_resolve, reject) => {
          rejectSecond = reject;
        });
      }),
    );

    const view = render(<FilePreview fileId="f1" mimeType="application/pdf" name="first.pdf" />);
    view.rerender(<FilePreview fileId="f2" mimeType="application/pdf" name="second.pdf" />);

    await act(async () => {
      rejectFirst(new TypeError("Failed to fetch"));
    });
    expect(screen.queryByText(en.files.details.loadFailed)).toBeNull();

    await act(async () => {
      rejectSecond(new TypeError("Failed to fetch"));
    });
    expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();
  });

  it("does not allocate a blob URL if a slow download finishes after the user moved to another file", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let resolveBlob: (b: Blob) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        if (String(input).includes("/f1/")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            blob: () =>
              new Promise<Blob>((resolve) => {
                resolveBlob = resolve;
              }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 404,
          blob: async () => new Blob(),
        });
      }),
    );

    const view = render(<FilePreview fileId="f1" mimeType="application/pdf" name="first.pdf" />);
    view.rerender(<FilePreview fileId="f2" mimeType="application/pdf" name="second.pdf" />);
    expect(await screen.findByText(en.files.details.loadFailed)).toBeInTheDocument();

    await act(async () => {
      resolveBlob(new Blob(["%PDF-1.4"]));
    });

    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it("revokes generated previewSrc and drops in-flight preview generation on unmount", async () => {
    let resolveSecond: (value: unknown) => void = () => {};
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(() => {
        call += 1;
        if (call === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
          });
        }
        return new Promise((resolve) => {
          resolveSecond = resolve;
        });
      }),
    );

    const view = render(
      <FilePreview
        fileId="f1"
        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        name="report.docx"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.generatePreview }));
    expect(await screen.findByTitle("report.docx")).toHaveAttribute("src", "blob:loaded");

    view.rerender(<FilePreview fileId="f2" mimeType="video/x-matroska" name="clip.mkv" />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:loaded");

    vi.mocked(URL.createObjectURL).mockClear();
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.generatePreview }));
    view.unmount();

    await act(async () => {
      resolveSecond({
        ok: true,
        status: 200,
        blob: async () => new Blob(["mp4"], { type: "video/mp4" }),
      });
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });

  it.each([
    [
      "Office document",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "report.docx",
    ],
    ["non-native video", "video/x-matroska", "clip.mkv"],
  ])(
    "logs and surfaces the retry error when on-demand preview generation rejects for %s",
    async (_label, mimeType, name) => {
      const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      const networkError = new TypeError("Failed to fetch");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => {
          throw networkError;
        }),
      );

      render(<FilePreview fileId="f1" mimeType={mimeType} name={name} />);
      fireEvent.click(screen.getByRole("button", { name: en.toolPage.generatePreview }));

      expect(await screen.findByText(en.files.details.previewFailedRetry)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: en.toolPage.generatePreview })).toBeInTheDocument();
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining("[file-preview] failed to generate preview for file f1"),
        networkError,
      );
    },
  );

  it("clears a failed image thumbnail state when switching to another image and handles img decode error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string) => {
        if (String(input).includes("/f1/")) {
          return { ok: false, status: 404, blob: async () => new Blob() };
        }
        return {
          ok: true,
          status: 200,
          blob: async () => new Blob(["png"], { type: "image/png" }),
        };
      }),
    );

    const view = render(<FilePreview fileId="f1" mimeType="image/png" name="broken.png" />);
    await waitFor(() => {
      expect(view.container.querySelector(".animate-spin")).toBeNull();
    });
    expect(screen.queryByRole("img")).toBeNull();

    view.rerender(<FilePreview fileId="f2" mimeType="image/png" name="working.png" />);

    const img = await screen.findByRole("img", { name: "working.png" });
    expect(img).toHaveAttribute("src", "blob:loaded");

    fireEvent.error(img);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it.each([
    ["image thumbnail", "image/png", "photo.png", "img"],
    ["PDF", "application/pdf", "report.pdf", "iframe"],
    ["native video", "video/mp4", "clip.mp4", "video"],
    ["native audio", "audio/mpeg", "track.mp3", '[data-testid="waveform-player"]'],
  ])(
    "revokes the active blob URL when unmounted for %s (#2966)",
    async (_label, mimeType, name, selector) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => ({
          ok: true,
          status: 200,
          blob: async () => new Blob(["bytes"], { type: mimeType }),
        })),
      );

      const first = render(<FilePreview fileId="f0" mimeType={mimeType} name={name} />);
      await waitFor(() => {
        expect(first.container.querySelector(selector)).not.toBeNull();
      });
      first.unmount();
      vi.mocked(URL.revokeObjectURL).mockClear();

      const view = render(<FilePreview fileId="f1" mimeType={mimeType} name={name} />);
      await waitFor(() => {
        expect(view.container.querySelector(selector)).not.toBeNull();
      });
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();

      view.unmount();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:loaded");
    },
  );

  it("revokes the generated previewSrc blob URL when unmounted without changing fileId first (#2966)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(["%PDF-1.4"], { type: "application/pdf" }),
      })),
    );

    const view = render(
      <FilePreview
        fileId="f1"
        mimeType="application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        name="report.docx"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.generatePreview }));
    expect(await screen.findByTitle("report.docx")).toHaveAttribute("src", "blob:loaded");
    expect(URL.revokeObjectURL).not.toHaveBeenCalled();

    view.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:loaded");
  });

  it("revokes the image thumbnail blob URL when switching from an image to a non-image file (#2966)", async () => {
    let call = 0;
    vi.mocked(URL.createObjectURL).mockImplementation(() => {
      call += 1;
      return `blob:url-${call}`;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        blob: async () => new Blob(["bytes"]),
      })),
    );

    const view = render(<FilePreview fileId="f1" mimeType="image/png" name="photo.png" />);
    expect(await screen.findByRole("img", { name: "photo.png" })).toHaveAttribute(
      "src",
      "blob:url-1",
    );

    view.rerender(<FilePreview fileId="f2" mimeType="application/pdf" name="report.pdf" />);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:url-1");
    expect(await screen.findByTitle("report.pdf")).toHaveAttribute("src", "blob:url-2");
  });

  it("aborts an in-flight image thumbnail fetch when switching files or unmounting and ignores late resolution or rejection (#2966)", async () => {
    const signals: AbortSignal[] = [];
    let rejectFirst: (err: Error) => void = () => {};
    let resolveSecond: (res: unknown) => void = () => {};
    let resolveThird: (res: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string, init?: RequestInit) => {
        if (init?.signal) signals.push(init.signal);
        const url = String(input);
        if (url.includes("/f1/")) {
          return new Promise((_resolve, reject) => {
            rejectFirst = reject;
          });
        }
        if (url.includes("/f2/")) {
          return new Promise((resolve) => {
            resolveSecond = resolve;
          });
        }
        return new Promise((resolve) => {
          resolveThird = resolve;
        });
      }),
    );

    const view = render(<FilePreview fileId="f1" mimeType="image/png" name="first.png" />);
    expect(signals).toHaveLength(1);
    expect(signals[0].aborted).toBe(false);

    view.rerender(<FilePreview fileId="f2" mimeType="image/png" name="second.png" />);
    expect(signals[0].aborted).toBe(true);
    expect(signals[1].aborted).toBe(false);

    await act(async () => {
      rejectFirst(new DOMException("The operation was aborted.", "AbortError"));
    });
    expect(view.container.querySelector(".animate-spin")).not.toBeNull();
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    view.rerender(<FilePreview fileId="f3" mimeType="image/png" name="third.png" />);
    expect(signals[1].aborted).toBe(true);
    expect(signals[2].aborted).toBe(false);

    await act(async () => {
      resolveSecond({
        ok: true,
        status: 200,
        blob: async () => new Blob(["stale-png"], { type: "image/png" }),
      });
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();

    view.unmount();
    expect(signals[2].aborted).toBe(true);

    await act(async () => {
      resolveThird({
        ok: true,
        status: 200,
        blob: async () => new Blob(["unmounted-png"], { type: "image/png" }),
      });
    });
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
