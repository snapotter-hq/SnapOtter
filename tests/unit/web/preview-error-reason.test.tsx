// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { loadTranslations, SUPPORTED_LOCALES } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NonNativePreview } from "@/components/common/non-native-preview";
import { FilePreview } from "@/components/files/file-details";

/**
 * #1290: both preview surfaces threw away the 422 body and always showed a
 * generic "preview failed". When the server's ffmpeg lacks an encoder, the API
 * says which one (code ENCODER_MISSING plus the encoder name), and the UI now
 * shows a translated message naming it. Every other failure stays generic.
 */

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A fetch that answers every call with this status and JSON body (or a non-JSON body). */
function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError("Unexpected token < in JSON");
      return body;
    },
    blob: async () => new Blob(["x"]),
  }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

const ENCODER_MISSING = {
  error: "This server's ffmpeg build has no libmp3lame encoder, which mp3 output needs.",
  code: "ENCODER_MISSING",
  encoder: "libmp3lame",
};

describe("on-demand preview (NonNativePreview) error reason (#1290)", () => {
  function renderPreview() {
    render(
      <NonNativePreview
        file={new File(["x"], "clip.wma")}
        filename="clip.wma"
        fileSize={1}
        modality="audio"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
  }

  it("names the missing encoder", async () => {
    stubFetch(422, ENCODER_MISSING);
    renderPreview();
    expect(await screen.findByText(/libmp3lame/)).toBeInTheDocument();
    expect(screen.queryByText("Preview generation failed")).not.toBeInTheDocument();
  });

  it("keeps the generic message for any other failure", async () => {
    stubFetch(422, { error: "Could not generate preview" });
    renderPreview();
    expect(await screen.findByText("Preview generation failed")).toBeInTheDocument();
  });

  it("keeps the generic message when the body is not JSON", async () => {
    stubFetch(502, undefined);
    renderPreview();
    expect(await screen.findByText("Preview generation failed")).toBeInTheDocument();
  });

  it("ignores an encoder code without an encoder name", async () => {
    stubFetch(422, { error: "x", code: "ENCODER_MISSING" });
    renderPreview();
    expect(await screen.findByText("Preview generation failed")).toBeInTheDocument();
  });
});

describe("NonNativePreview when the file changes (#1290)", () => {
  it("drops the previous file's error instead of naming its encoder for the new one", async () => {
    stubFetch(422, ENCODER_MISSING);
    const view = render(
      <NonNativePreview
        file={new File(["x"], "a.wma")}
        filename="a.wma"
        fileSize={1}
        modality="audio"
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
    expect(await screen.findByText(/libmp3lame/)).toBeInTheDocument();

    view.rerender(
      <NonNativePreview
        file={new File(["y"], "b.avi")}
        filename="b.avi"
        fileSize={1}
        modality="video"
      />,
    );
    expect(screen.queryByText(/libmp3lame/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /generate preview/i })).toBeInTheDocument();
  });
});

describe("stored-file preview (FilePreview) error reason (#1290)", () => {
  function renderPreview(mimeType: string, name: string) {
    render(<FilePreview fileId="f1" mimeType={mimeType} name={name} />);
    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
  }

  it("names the missing encoder for a media file", async () => {
    stubFetch(422, ENCODER_MISSING);
    renderPreview("audio/x-ms-wma", "clip.wma");
    expect(await screen.findByText(/libmp3lame/)).toBeInTheDocument();
  });

  it("keeps the generic retry message for any other failure", async () => {
    stubFetch(422, { error: "Could not generate preview" });
    renderPreview("audio/x-ms-wma", "clip.wma");
    expect(await screen.findByText("Preview generation failed. Try again.")).toBeInTheDocument();
  });
});

describe("FilePreview when the file changes (#1290)", () => {
  it("clears the previous file's error", async () => {
    stubFetch(422, ENCODER_MISSING);
    const view = render(<FilePreview fileId="f1" mimeType="audio/x-ms-wma" name="a.wma" />);
    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
    expect(await screen.findByText(/libmp3lame/)).toBeInTheDocument();

    view.rerender(<FilePreview fileId="f2" mimeType="audio/x-ms-wma" name="b.wma" />);
    expect(screen.queryByText(/libmp3lame/)).not.toBeInTheDocument();
  });

  it("drops a reply that arrives after the user moved to another file", async () => {
    let respond: (value: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            respond = resolve;
          }),
      ),
    );
    const view = render(<FilePreview fileId="f1" mimeType="audio/x-ms-wma" name="a.wma" />);
    fireEvent.click(screen.getByRole("button", { name: /generate preview/i }));
    view.rerender(<FilePreview fileId="f2" mimeType="audio/x-ms-wma" name="b.wma" />);

    await act(async () => {
      respond({ ok: false, status: 422, json: async () => ENCODER_MISSING });
    });
    expect(screen.queryByText(/libmp3lame/)).not.toBeInTheDocument();
  });
});

describe("toolPage.previewEncoderMissing translations (#1290)", () => {
  // format() leaves a missing placeholder as literal text without failing, so a
  // translation that drops {encoder} would show no encoder name at all.
  it("covers all 21 locales", () => {
    expect(SUPPORTED_LOCALES).toHaveLength(21);
  });

  it.each(SUPPORTED_LOCALES)(
    "%s keeps the {encoder} placeholder and the ffmpeg name",
    async (locale) => {
      const message = (await loadTranslations(locale)).toolPage.previewEncoderMissing;
      expect(message).toContain("{encoder}");
      expect(message).toContain("ffmpeg");
    },
  );
});
