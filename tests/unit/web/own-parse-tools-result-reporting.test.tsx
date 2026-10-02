// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { BarcodeReadSettings } from "@/components/tools/barcode-read-settings";
import { CollageSettings } from "@/components/tools/collage-settings";
import { StitchSettings } from "@/components/tools/stitch-settings";
import { captureHandledError } from "@/lib/analytics";
import { format } from "@/lib/format";
import { useCollageStore } from "@/stores/collage-store";
import { useFileStore } from "@/stores/file-store";

/**
 * Stitch, Collage and Barcode Read post with their own XHR and read the sync
 * 2xx answer themselves, so nothing in useToolProcessor answers for them
 * (#1795). These pin the split #1740 and #1734 made for the other callers: a
 * body that isn't a result is the server's fault, fails the run as an invalid
 * response and is reported without any of its text; a throw while landing a
 * good one is ours, ends the run with the tracking message and is rethrown,
 * never reported as a malformed answer.
 */

const NOT_AN_OBJECT = "Tool result body is not a JSON object";
const NO_DOWNLOAD_URL = "Tool result has no download URL";
const NOT_A_BARCODE_RESULT = "Tool result is not a barcode read result";

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

  constructor() {
    FakeXhr.instances.push(this);
  }

  open(_method: string, url: string) {
    this.url = url;
  }

  setRequestHeader(_key: string, _value: string) {}

  send(_body: FormData) {}

  respond(status: number, body: unknown) {
    this.respondRaw(status, JSON.stringify(body));
  }

  respondRaw(status: number, text: string) {
    act(() => {
      this.status = status;
      this.responseText = text;
      this.onload?.();
    });
  }
}

function image(name: string): File {
  return new File(["png"], name, { type: "image/png" });
}

async function submit(testId: string): Promise<FakeXhr> {
  fireEvent.click(screen.getByTestId(testId));
  await waitFor(() => expect(FakeXhr.instances).toHaveLength(1));
  return FakeXhr.instances[0];
}

function expectReported(message: string, toolId: string, statusCode = 200) {
  expect(vi.mocked(captureHandledError)).toHaveBeenCalledTimes(1);
  const [error, tags] = vi.mocked(captureHandledError).mock.calls[0];
  expect(error.message).toBe(message);
  expect(error.cause).toBeUndefined();
  expect((error as { statusCode?: number }).statusCode).toBe(statusCode);
  expect(tags).toEqual({ error_class: "operational", tool_id: toolId });
}

/**
 * Collage lands its result after an await, so a rethrow leaves the click
 * handler as a rejection. Takes that over from vitest until `restore`, so a
 * test can assert on it instead of failing the run. Call `restore` in a
 * finally that starts right after this, or vitest's listener stays gone.
 */
function takeOverUnhandledRejections() {
  const saved = process.listeners("unhandledRejection");
  const rejections: unknown[] = [];
  const onRejection = (reason: unknown) => {
    rejections.push(reason);
  };
  process.removeAllListeners("unhandledRejection");
  process.on("unhandledRejection", onRejection);
  return {
    rejections,
    restore() {
      process.off("unhandledRejection", onRejection);
      for (const listener of saved) process.on("unhandledRejection", listener);
    },
  };
}

/** A body a proxy might send: its text must never reach the report. */
const HTML_BODY = "<html>secret-token</html>";

beforeEach(() => {
  let blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  vi.mocked(captureHandledError).mockClear();
  useFileStore.getState().reset();
  useCollageStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  useFileStore.getState().reset();
  useCollageStore.getState().reset();
});

describe("stitch: a malformed sync answer apart from our own store write", () => {
  const DOWNLOAD_URL = "/api/v1/download/job-1/stitched.png";
  const GOOD_BODY = {
    jobId: "job-1",
    downloadUrl: DOWNLOAD_URL,
    originalSize: 2000,
    processedSize: 1500,
  };

  beforeEach(() => {
    useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
  });

  it("lands a good result", async () => {
    render(<StitchSettings />);

    (await submit("stitch-submit")).respond(200, GOOD_BODY);

    await waitFor(() => expect(screen.getByTestId("stitch-download")).toBeInTheDocument());
    expect(screen.getByTestId("stitch-download")).toHaveAttribute("href", DOWNLOAD_URL);
    expect(useFileStore.getState().entries[0].processedUrl).toBe(DOWNLOAD_URL);
    expect(useFileStore.getState().processing).toBe(false);
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that does not parse", HTML_BODY, NOT_AN_OBJECT],
    ["a JSON null body", "null", NOT_AN_OBJECT],
    ["an empty object", "{}", NO_DOWNLOAD_URL],
  ])("fails as an invalid response, and reports it, for %s", async (_label, text, message) => {
    render(<StitchSettings />);

    (await submit("stitch-submit")).respondRaw(200, text);

    await waitFor(() => expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument());
    expect(screen.queryByTestId("stitch-download")).not.toBeInTheDocument();
    expect(useFileStore.getState().processing).toBe(false);
    expectReported(message, "stitch");
  });

  it("reports the status the answer came with", async () => {
    render(<StitchSettings />);

    (await submit("stitch-submit")).respondRaw(201, "{}");

    await waitFor(() => expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument());
    expectReported(NO_DOWNLOAD_URL, "stitch", 201);
  });

  it("ends the run with the tracking message when landing the result throws", async () => {
    render(<StitchSettings />);
    const xhr = await submit("stitch-submit");
    let thrown = false;
    const unsubscribe = useFileStore.subscribe((s) => {
      if (s.entries[0]?.processedUrl && !thrown) {
        thrown = true;
        throw new Error("boom");
      }
    });

    try {
      expect(() => xhr.respond(200, GOOD_BODY)).toThrow("boom");
      await act(async () => {});

      await waitFor(() =>
        expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument(),
      );
      expect(screen.queryByText(en.errors.invalidResponse)).not.toBeInTheDocument();
      expect(useFileStore.getState().processing).toBe(false);
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("shows the server's error text for a failed request without reporting it", async () => {
    render(<StitchSettings />);

    (await submit("stitch-submit")).respond(422, { error: "Stitching failed" });

    await waitFor(() => expect(screen.getByText("Stitching failed")).toBeInTheDocument());
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });
});

describe("collage: a malformed sync answer apart from our own store write", () => {
  const DOWNLOAD_URL = "/api/v1/download/job-1/collage.png";
  const GOOD_BODY = {
    jobId: "job-1",
    downloadUrl: DOWNLOAD_URL,
    originalSize: 2000,
    processedSize: 1500,
  };

  beforeEach(() => {
    useCollageStore.getState().addImages([image("one.png"), image("two.png")]);
  });

  it("lands a good result", async () => {
    render(<CollageSettings />);

    (await submit("collage-submit")).respond(200, GOOD_BODY);

    // The panel keeps the spinner up for a moment before it lands the result.
    await waitFor(() => expect(screen.getByTestId("collage-download")).toBeInTheDocument(), {
      timeout: 3000,
    });
    expect(screen.getByTestId("collage-download")).toHaveAttribute("href", DOWNLOAD_URL);
    expect(useCollageStore.getState().phase).toBe("result");
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that does not parse", HTML_BODY, NOT_AN_OBJECT],
    ["a JSON array body", "[]", NOT_AN_OBJECT],
    ["an empty object", "{}", NO_DOWNLOAD_URL],
  ])("fails as an invalid response, and reports it, for %s", async (_label, text, message) => {
    render(<CollageSettings />);

    (await submit("collage-submit")).respondRaw(200, text);

    await waitFor(() => expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument());
    expect(screen.queryByTestId("collage-download")).not.toBeInTheDocument();
    expect(useCollageStore.getState().phase).toBe("editing");
    expectReported(message, "collage");
  });

  it("reports the status the answer came with", async () => {
    render(<CollageSettings />);

    (await submit("collage-submit")).respondRaw(201, "{}");

    await waitFor(() => expect(screen.getByText(en.errors.invalidResponse)).toBeInTheDocument());
    expectReported(NO_DOWNLOAD_URL, "collage", 201);
  });

  it("ends the run when the progress write on a good answer throws", async () => {
    render(<CollageSettings />);
    const xhr = await submit("collage-submit");
    let thrown = false;
    const unsubscribe = useCollageStore.subscribe((s) => {
      if (s.progress === 100 && !thrown) {
        thrown = true;
        throw new Error("boom");
      }
    });

    try {
      // Before #1795 this throw skipped resolve and reject both, so the run
      // sat at processing for good.
      expect(() => xhr.respond(200, GOOD_BODY)).toThrow("boom");
      await act(async () => {});

      await waitFor(() =>
        expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument(),
      );
      expect(useCollageStore.getState().phase).toBe("editing");
      expect(screen.queryByTestId("collage-download")).not.toBeInTheDocument();
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
    }
  });

  it("ends the run with the tracking message when landing the result throws", async () => {
    const { rejections, restore } = takeOverUnhandledRejections();
    let unsubscribe = () => {};
    try {
      render(<CollageSettings />);
      const xhr = await submit("collage-submit");
      let thrown = false;
      unsubscribe = useCollageStore.subscribe((s) => {
        if (s.resultUrl && !thrown) {
          thrown = true;
          throw new Error("boom");
        }
      });

      xhr.respond(200, GOOD_BODY);

      await waitFor(
        () => expect(screen.getByText(en.errors.jobTrackingFailed)).toBeInTheDocument(),
        { timeout: 3000 },
      );
      await waitFor(() =>
        expect(rejections).toEqual([expect.objectContaining({ message: "boom" })]),
      );
      expect(screen.queryByText(en.errors.invalidResponse)).not.toBeInTheDocument();
      expect(useCollageStore.getState().phase).toBe("editing");
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      restore();
    }
  });

  it("still rethrows the root cause when ending the run throws too", async () => {
    const { rejections, restore } = takeOverUnhandledRejections();
    let unsubscribe = () => {};
    try {
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
      render(<CollageSettings />);
      const xhr = await submit("collage-submit");
      // Breaks every write once the result lands: setResult throws the root
      // cause, then the teardown's setError throws again.
      let writes = 0;
      unsubscribe = useCollageStore.subscribe((s) => {
        if (!s.resultUrl) return;
        writes++;
        throw new Error(writes === 1 ? "root cause" : "teardown broke");
      });

      xhr.respond(200, GOOD_BODY);

      await waitFor(
        () => expect(rejections).toEqual([expect.objectContaining({ message: "root cause" })]),
        { timeout: 3000 },
      );
      expect(consoleError).toHaveBeenCalledWith(
        "Ending the run after a result handling error failed",
        expect.objectContaining({ message: "teardown broke" }),
      );
      // zustand sets the state before its listeners run, so the write landed.
      expect(useCollageStore.getState().error).toBe(en.errors.jobTrackingFailed);
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      unsubscribe();
      restore();
    }
  });
});

describe("barcode read: a malformed sync answer apart from our own store write", () => {
  const ANNOTATED_URL = "/api/v1/download/job-1/annotated-photo.png";
  const GOOD_BODY = {
    filename: "photo.png",
    barcodes: [
      {
        type: "QRCode",
        text: "hello-otter",
        position: {
          topLeft: { x: 0, y: 0 },
          topRight: { x: 10, y: 0 },
          bottomLeft: { x: 0, y: 10 },
          bottomRight: { x: 10, y: 10 },
        },
      },
    ],
    annotatedUrl: ANNOTATED_URL,
    previewUrl: ANNOTATED_URL,
  };

  beforeEach(() => {
    useFileStore.getState().setFiles([image("photo.png")]);
  });

  async function settle() {
    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
  }

  it("lands a good result", async () => {
    render(<BarcodeReadSettings />);

    (await submit("barcode-read-submit")).respond(200, GOOD_BODY);
    await settle();

    expect(screen.getByText("hello-otter")).toBeInTheDocument();
    expect(useFileStore.getState().entries[0].processedUrl).toBe(ANNOTATED_URL);
    expect(useFileStore.getState().error).toBeNull();
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it("lands an answer with nothing found", async () => {
    render(<BarcodeReadSettings />);

    (await submit("barcode-read-submit")).respond(200, {
      filename: "photo.png",
      barcodes: [],
      annotatedUrl: null,
      previewUrl: null,
    });
    await settle();

    expect(screen.getAllByText(en.toolSettings["barcode-read"].noBarcodesFound).length).toBe(2);
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expect(useFileStore.getState().error).toBeNull();
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });

  it.each([
    ["a body that does not parse", HTML_BODY, NOT_AN_OBJECT],
    ["a JSON string body", '"ok"', NOT_AN_OBJECT],
    ["a JSON array body", "[]", NOT_AN_OBJECT],
    ["an empty object", "{}", NOT_A_BARCODE_RESULT],
    [
      "a filename that is not a string",
      JSON.stringify({ filename: 7, barcodes: [], annotatedUrl: null }),
      NOT_A_BARCODE_RESULT,
    ],
    [
      "a barcode with no type",
      JSON.stringify({ filename: "photo.png", barcodes: [{ text: "x" }], annotatedUrl: null }),
      NOT_A_BARCODE_RESULT,
    ],
    [
      "a barcode that is null",
      JSON.stringify({ filename: "photo.png", barcodes: [null], annotatedUrl: null }),
      NOT_A_BARCODE_RESULT,
    ],
    [
      "a blank annotated image URL",
      JSON.stringify({ filename: "photo.png", barcodes: [], annotatedUrl: "" }),
      NOT_A_BARCODE_RESULT,
    ],
    [
      "no annotated image URL at all",
      JSON.stringify({ filename: "photo.png", barcodes: [] }),
      NOT_A_BARCODE_RESULT,
    ],
    [
      "a barcode list that is not a list",
      JSON.stringify({ filename: "photo.png", barcodes: "none", annotatedUrl: null }),
      NOT_A_BARCODE_RESULT,
    ],
    [
      "a barcode with no text",
      JSON.stringify({ filename: "photo.png", barcodes: [{ type: "QRCode" }], annotatedUrl: null }),
      NOT_A_BARCODE_RESULT,
    ],
    [
      "an annotated image URL that is not one",
      JSON.stringify({ filename: "photo.png", barcodes: [], annotatedUrl: 7 }),
      NOT_A_BARCODE_RESULT,
    ],
  ])("fails as an invalid response, and reports it, for %s", async (_label, text, message) => {
    render(<BarcodeReadSettings />);

    (await submit("barcode-read-submit")).respondRaw(200, text);
    await settle();

    expect(useFileStore.getState().error).toBe(`photo.png: ${en.errors.invalidResponse}`);
    expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
    expectReported(message, "barcode-read");
  });

  it("reports the status the answer came with", async () => {
    render(<BarcodeReadSettings />);

    (await submit("barcode-read-submit")).respondRaw(201, "{}");
    await settle();

    expectReported(NOT_A_BARCODE_RESULT, "barcode-read", 201);
  });

  it("fails the file with the tracking message when landing its result throws", async () => {
    const realUpdateEntry = useFileStore.getState().updateEntry;
    // The panel reads updateEntry off the store when the run starts, and
    // landing the result is the run's first entry write.
    vi.spyOn(useFileStore.getState(), "updateEntry")
      .mockImplementationOnce(() => {
        throw new Error("boom");
      })
      .mockImplementation(realUpdateEntry);
    render(<BarcodeReadSettings />);
    const xhr = await submit("barcode-read-submit");

    try {
      expect(() => xhr.respond(200, GOOD_BODY)).toThrow("boom");
      await act(async () => {});
      await settle();

      expect(useFileStore.getState().error).toBe(`photo.png: ${en.errors.jobTrackingFailed}`);
      expect(useFileStore.getState().error).not.toContain(en.errors.invalidResponse);
      // The barcodes went in before the write that threw: one row, no
      // placeholder row on top of it.
      expect(screen.getAllByText("hello-otter")).toHaveLength(1);
      expect(
        screen.queryByText(en.toolSettings["barcode-read"].noBarcodesFound),
      ).not.toBeInTheDocument();
      expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
    } finally {
      useFileStore.setState({ updateEntry: realUpdateEntry });
    }
  });

  describe("over several files", () => {
    beforeEach(() => {
      useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
    });

    /** Answers each file's request in turn, once the panel has sent it. */
    async function answerEach(...answers: Array<(xhr: FakeXhr) => void>) {
      render(<BarcodeReadSettings />);
      fireEvent.click(screen.getByTestId("barcode-read-submit"));
      for (const [i, answer] of answers.entries()) {
        await waitFor(() => expect(FakeXhr.instances).toHaveLength(i + 1));
        answer(FakeXhr.instances[i]);
        await act(async () => {});
      }
      await settle();
    }

    const filesFailed = (count: number) =>
      format(en.toolSettings["barcode-read"].filesFailed, { count, total: 2 });

    it("keeps a good file's result when the other answer is malformed", async () => {
      await answerEach(
        (xhr) => xhr.respond(200, {}),
        (xhr) => xhr.respond(200, { ...GOOD_BODY, filename: "two.png" }),
      );

      expect(useFileStore.getState().error).toBe(filesFailed(1));
      expect(screen.getByText("one.png")).toBeInTheDocument();
      expect(screen.getByText("two.png")).toBeInTheDocument();
      expect(screen.getByText("hello-otter")).toBeInTheDocument();
      expect(useFileStore.getState().entries[0].processedUrl).toBeNull();
      expect(useFileStore.getState().entries[1].processedUrl).toBe(ANNOTATED_URL);
      expectReported(NOT_A_BARCODE_RESULT, "barcode-read");
    });

    it("keeps a row for a malformed answer that comes second", async () => {
      await answerEach(
        (xhr) => xhr.respond(200, { ...GOOD_BODY, filename: "one.png" }),
        (xhr) => xhr.respondRaw(200, HTML_BODY),
      );

      expect(useFileStore.getState().error).toBe(filesFailed(1));
      expect(screen.getByText("one.png")).toBeInTheDocument();
      expect(screen.getByText("two.png")).toBeInTheDocument();
      expectReported(NOT_AN_OBJECT, "barcode-read");
    });

    it("adds no extra row when landing the second file throws", async () => {
      const realUpdateEntry = useFileStore.getState().updateEntry;
      vi.spyOn(useFileStore.getState(), "updateEntry")
        .mockImplementationOnce(realUpdateEntry)
        .mockImplementationOnce(() => {
          throw new Error("boom");
        })
        .mockImplementation(realUpdateEntry);

      try {
        await answerEach(
          (xhr) => xhr.respond(200, { ...GOOD_BODY, filename: "one.png" }),
          (xhr) =>
            expect(() => xhr.respond(200, { ...GOOD_BODY, filename: "two.png" })).toThrow("boom"),
        );

        expect(useFileStore.getState().error).toBe(filesFailed(1));
        expect(screen.getAllByText("hello-otter")).toHaveLength(2);
        expect(
          screen.queryByText(en.toolSettings["barcode-read"].noBarcodesFound),
        ).not.toBeInTheDocument();
        expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
      } finally {
        useFileStore.setState({ updateEntry: realUpdateEntry });
      }
    });
  });

  it("shows the server's error text for a failed request without reporting it", async () => {
    render(<BarcodeReadSettings />);

    (await submit("barcode-read-submit")).respond(422, { error: "Barcode detection failed" });
    await settle();

    expect(useFileStore.getState().error).toBe("photo.png: Barcode detection failed");
    expect(vi.mocked(captureHandledError)).not.toHaveBeenCalled();
  });
});
