// @vitest-environment jsdom
import { ANALYTICS_EVENTS, en, isSafeMessageError } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const analyticsMock = vi.hoisted(() => ({
  track: vi.fn(),
  // formatHeaders() in @/lib/api reads this.
  getDistinctId: () => null,
  captureHandledError: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => analyticsMock);

vi.mock("@/components/feedback/tool-feedback-prompt", () => ({
  ToolFeedbackPrompt: () => null,
}));

import { ReviewPanel } from "@/components/common/review-panel";
import { useFileStore } from "@/stores/file-store";

const RESULT_URL = "/api/v1/download/job-1/a-resized.png";
const UPLOAD_URL = "/api/v1/files/upload";

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  analyticsMock.track.mockClear();
  analyticsMock.captureHandledError.mockClear();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([new File(["x"], "a.png", { type: "image/png" })]);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function panel(currentToolId = "resize", downloadUrl = RESULT_URL) {
  return (
    <MemoryRouter>
      <ReviewPanel
        filename="a-resized.png"
        fileSize={100}
        fileType="image/png"
        originalSize={200}
        downloadUrl={downloadUrl}
        onUndo={() => {}}
        onStartOver={() => {}}
        currentToolId={currentToolId}
      />
    </MemoryRouter>
  );
}

function renderPanel(currentToolId = "resize") {
  return render(panel(currentToolId));
}

function stubFetch(result: () => Promise<unknown>, upload: () => Promise<unknown>) {
  const fetchMock = vi.fn((input: string) => (input === RESULT_URL ? result() : upload()));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function clickSave() {
  fireEvent.click(screen.getByRole("button", { name: /save to files/i }));
  await act(async () => {});
}

function uploadCalls(fetchMock: ReturnType<typeof stubFetch>) {
  return fetchMock.mock.calls.filter(([url]) => String(url).endsWith(UPLOAD_URL));
}

function savedEvents() {
  return analyticsMock.track.mock.calls.filter(
    ([event]) => event === ANALYTICS_EVENTS.RESULT_SAVED,
  );
}

function reportedError(): Error {
  expect(analyticsMock.captureHandledError).toHaveBeenCalledTimes(1);
  const [err, tags] = analyticsMock.captureHandledError.mock.calls[0] as unknown as [
    Error,
    Record<string, string>,
  ];
  expect(isSafeMessageError(err)).toBe(true);
  expect(tags).toEqual({ error_class: "operational", tool_id: "resize" });
  return err;
}

// #1286: a failed result fetch used to be uploaded to the library as the
// user's file, and the panel said "Saved to Files".
describe("ReviewPanel Save to Files failures (#1286)", () => {
  it("does not upload an error page when the result fetch returns 404", async () => {
    const fetchMock = stubFetch(
      () =>
        Promise.resolve({
          ok: false,
          status: 404,
          blob: () => Promise.resolve(new Blob(['{"error":"File not found"}'])),
        }),
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel();
    await clickSave();

    expect(uploadCalls(fetchMock)).toHaveLength(0);
    expect(screen.queryByText("Saved to Files")).toBeNull();
    expect(screen.getByText(en.toolPage.resultExpired)).toBeTruthy();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
    expect(savedEvents()).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();
    expect(reportedError().message).toContain("HTTP 404");
  });

  // Offline or a dropped connection: the user sees the error, but Sentry's
  // IGNORE_ERRORS already drops "Failed to fetch", and wrapping it in a
  // SafeError would sneak it past that filter.
  it.each([
    ["a result fetch", "result"],
    ["an upload", "upload"],
  ])("shows but does not report %s that never got a response", async (_label, which) => {
    const networkError = new TypeError("Failed to fetch");
    const okResult = () =>
      Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(["png"])) });
    stubFetch(
      which === "result" ? () => Promise.reject(networkError) : okResult,
      which === "upload"
        ? () => Promise.reject(networkError)
        : () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel();
    await clickSave();

    expect(screen.getByText("An error occurred")).toBeTruthy();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
    expect(consoleError).toHaveBeenCalledWith("Save to Files failed", networkError);
    expect(analyticsMock.captureHandledError).not.toHaveBeenCalled();
  });

  it("reports an unexpected client-side failure, wrapped with its cause", async () => {
    const bug = new Error("blob() exploded");
    stubFetch(
      () => Promise.resolve({ ok: true, status: 200, blob: () => Promise.reject(bug) }),
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel();
    await clickSave();

    expect(screen.getByText("An error occurred")).toBeTruthy();
    expect(reportedError().cause).toBe(bug);
  });

  // Signed out or not allowed: about the user's own account, and nothing for us
  // to fix, so shown but not reported. (413 has its own copy; see #1350 below.)
  it.each([401, 403])("shows but does not report an upload %i", async (status) => {
    stubFetch(
      () =>
        Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(["png"])) }),
      () => Promise.resolve({ ok: false, status }),
    );

    renderPanel();
    await clickSave();

    expect(screen.getByText("An error occurred")).toBeTruthy();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
    expect(consoleError).toHaveBeenCalled();
    expect(analyticsMock.captureHandledError).not.toHaveBeenCalled();
  });

  it("shows an error and reports the status when the library upload fails", async () => {
    const fetchMock = stubFetch(
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob(["png"])),
        }),
      () => Promise.resolve({ ok: false, status: 500 }),
    );

    renderPanel();
    await clickSave();

    expect(uploadCalls(fetchMock)).toHaveLength(1);
    expect(screen.queryByText("Saved to Files")).toBeNull();
    expect(screen.getByText("An error occurred")).toBeTruthy();
    expect(useFileStore.getState().entries[0].claimed).toBe(false);
    expect(savedEvents()).toHaveLength(0);
    expect(consoleError).toHaveBeenCalled();
    expect(reportedError().message).toContain("HTTP 500");
  });

  it("leaves the tool tag off a report when there is no tool id", async () => {
    stubFetch(
      () => Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }),
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel("");
    await clickSave();

    expect(analyticsMock.captureHandledError).toHaveBeenCalledTimes(1);
    const [, tags] = analyticsMock.captureHandledError.mock.calls[0] as unknown as [
      Error,
      Record<string, string>,
    ];
    expect(tags).toEqual({ error_class: "operational" });
  });

  it("goes back to the save button after the error, so the user can retry", async () => {
    vi.useFakeTimers();
    stubFetch(
      () => Promise.resolve({ ok: false, status: 500, blob: () => Promise.resolve(new Blob()) }),
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel();
    await clickSave();
    expect(screen.getByText("An error occurred")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });

    expect(screen.queryByText("An error occurred")).toBeNull();
    const button = screen.getByRole("button", { name: /save to files/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(false);
  });

  // The first failure's reset timer used to survive a retry. A retry that
  // succeeded inside those 3 seconds flipped back to an enabled "Save to Files"
  // and invited a duplicate save.
  it("keeps a successful retry's Saved state when the earlier error's timer runs out", async () => {
    vi.useFakeTimers();
    let resultCalls = 0;
    const fetchMock = stubFetch(
      () => {
        resultCalls += 1;
        return resultCalls === 1
          ? Promise.resolve({ ok: false, status: 500, blob: () => Promise.resolve(new Blob()) })
          : Promise.resolve({
              ok: true,
              status: 200,
              blob: () => Promise.resolve(new Blob(["png"])),
            });
      },
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel();
    await clickSave();
    expect(screen.getByText("An error occurred")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    // The error label is still up; the button under it is the retry.
    fireEvent.click(screen.getByRole("button", { name: /an error occurred/i }));
    await act(async () => {});
    expect(screen.getByText("Saved to Files")).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });

    expect(screen.getByText("Saved to Files")).toBeTruthy();
    const button = screen.getByRole("button", { name: /saved to files/i }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(uploadCalls(fetchMock)).toHaveLength(1);
  });

  it("styles the error state as an error, not as the idle link", async () => {
    stubFetch(
      () => Promise.resolve({ ok: false, status: 500, blob: () => Promise.resolve(new Blob()) }),
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel();
    await clickSave();

    const button = screen.getByRole("button", { name: /an error occurred/i });
    expect(button.className).toContain("text-destructive-ink");
    expect(button.className).not.toContain("text-muted-foreground");
  });

  it("still saves a result that fetched fine", async () => {
    const fetchMock = stubFetch(
      () =>
        Promise.resolve({
          ok: true,
          status: 200,
          blob: () => Promise.resolve(new Blob(["png"])),
        }),
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    renderPanel();
    await clickSave();

    expect(uploadCalls(fetchMock)).toHaveLength(1);
    expect(screen.getByText("Saved to Files")).toBeTruthy();
    expect(useFileStore.getState().entries[0].claimed).toBe(true);
    await vi.waitFor(() => expect(savedEvents()).toHaveLength(1));
    expect(analyticsMock.captureHandledError).not.toHaveBeenCalled();
    expect(consoleError).not.toHaveBeenCalled();
  });
});

const okResult = () =>
  Promise.resolve({ ok: true, status: 200, blob: () => Promise.resolve(new Blob(["png"])) });

function saveButtonNamed(name: string): HTMLButtonElement {
  return screen.getByRole("button", { name }) as HTMLButtonElement;
}

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };

/** The API's answer when the library is over quota. */
const quotaResponse = () =>
  new Response(
    JSON.stringify({
      error: "Storage quota exceeded. Used 10.0MB of 10.0MB",
      code: "STORAGE_QUOTA_EXCEEDED",
    }),
    { status: 413, headers: JSON_HEADERS },
  );

const failedResult = (status: number) => () =>
  Promise.resolve({ ok: false, status, blob: () => Promise.resolve(new Blob()) });

// #1350: every failure said "An error occurred" for three seconds and handed
// the same button back, even when the server had said why and a retry
// couldn't help.
describe("ReviewPanel Save to Files failure reasons (#1350)", () => {
  it.each([404, 410])(
    "says the result has expired on a %i, keeps saying it, and offers no retry",
    async (status) => {
      vi.useFakeTimers();
      const fetchMock = stubFetch(
        () => Promise.resolve({ ok: false, status, blob: () => Promise.resolve(new Blob()) }),
        () => Promise.resolve({ ok: true, status: 201 }),
      );

      renderPanel();
      await clickSave();

      expect(uploadCalls(fetchMock)).toHaveLength(0);
      expect(saveButtonNamed(en.toolPage.resultExpired).disabled).toBe(true);
      expect(screen.queryByText(en.common.error)).toBeNull();

      await act(async () => {
        vi.advanceTimersByTime(10_000);
      });

      expect(saveButtonNamed(en.toolPage.resultExpired).disabled).toBe(true);
      expect(screen.queryByRole("button", { name: en.toolPage.saveToFiles })).toBeNull();
    },
  );

  it("says the library is full on a quota 413, keeps saying it, and lets the user retry", async () => {
    vi.useFakeTimers();
    let uploads = 0;
    const fetchMock = stubFetch(okResult, () => {
      uploads += 1;
      return Promise.resolve(uploads === 1 ? quotaResponse() : new Response("{}", { status: 201 }));
    });

    renderPanel();
    await clickSave();

    expect(saveButtonNamed(en.toolPage.libraryFull).disabled).toBe(false);
    // About the user's own account: shown, not reported.
    expect(analyticsMock.captureHandledError).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(screen.getByText(en.toolPage.libraryFull)).toBeTruthy();

    // They freed some space; the same button tries again.
    fireEvent.click(saveButtonNamed(en.toolPage.libraryFull));
    await act(async () => {});

    expect(uploadCalls(fetchMock)).toHaveLength(2);
    expect(screen.getByText(en.toolPage.savedToFiles)).toBeTruthy();
    expect(useFileStore.getState().entries[0].claimed).toBe(true);
  });

  // The API's upload-limit 413 carries no quota code, and a reverse proxy's
  // 413 is an HTML page. Either way the file is too big, and stays too big.
  it.each([
    [
      "the API's upload limit",
      () =>
        new Response(
          JSON.stringify({
            error: "request file too large",
            details: "request file too large",
            code: "FST_REQ_FILE_TOO_LARGE",
          }),
          {
            status: 413,
            headers: JSON_HEADERS,
          },
        ),
    ],
    [
      "a proxy's HTML page",
      () =>
        new Response("<html>413 Request Entity Too Large</html>", {
          status: 413,
          headers: { "content-type": "text/html" },
        }),
    ],
  ])("says the file is too large on %s, and offers no retry", async (_label, response) => {
    vi.useFakeTimers();
    stubFetch(okResult, () => Promise.resolve(response()));

    renderPanel();
    await clickSave();

    expect(saveButtonNamed(en.errors.fileTooLarge).disabled).toBe(true);
    expect(screen.queryByText(en.toolPage.libraryFull)).toBeNull();
    expect(analyticsMock.captureHandledError).not.toHaveBeenCalled();

    await act(async () => {
      vi.advanceTimersByTime(10_000);
    });
    expect(saveButtonNamed(en.errors.fileTooLarge).disabled).toBe(true);
  });

  it("keeps the generic message for a 404 from the upload itself", async () => {
    stubFetch(okResult, () => Promise.resolve(new Response("{}", { status: 404 })));

    renderPanel();
    await clickSave();

    expect(screen.getByText(en.common.error)).toBeTruthy();
    expect(screen.queryByText(en.toolPage.resultExpired)).toBeNull();
  });

  it("clears an expired result's message when the panel moves to another result", async () => {
    stubFetch(
      () => Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }),
      () => Promise.resolve({ ok: true, status: 201 }),
    );

    const view = renderPanel();
    await clickSave();
    expect(screen.getByText(en.toolPage.resultExpired)).toBeTruthy();

    view.rerender(panel("resize", "/api/v1/download/job-2/b-resized.png"));

    expect(screen.queryByText(en.toolPage.resultExpired)).toBeNull();
    expect(saveButtonNamed(en.toolPage.saveToFiles).disabled).toBe(false);
  });

  // Our own JSON 413, cut off mid-read, might have been the quota answer, so
  // it gets no reason and the button comes back.
  it("keeps the generic, retryable message when a JSON 413 can't be read", async () => {
    vi.useFakeTimers();
    stubFetch(okResult, () =>
      Promise.resolve({
        ok: false,
        status: 413,
        headers: new Headers(JSON_HEADERS),
        json: () => Promise.reject(new TypeError("network error")),
      }),
    );

    renderPanel();
    await clickSave();

    expect(screen.getByText(en.common.error)).toBeTruthy();
    expect(screen.queryByText(en.errors.fileTooLarge)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(saveButtonNamed(en.toolPage.saveToFiles).disabled).toBe(false);
  });

  // The panel isn't remounted per result. A save that finishes after the user
  // moved on is about the result they left, and must not land on this one.
  it.each([
    ["an expired result", failedResult(404), () => Promise.resolve({ ok: true, status: 201 })],
    ["a full library", okResult, () => Promise.resolve(quotaResponse())],
    ["a success", okResult, () => Promise.resolve({ ok: true, status: 201 })],
  ])(
    "leaves the new result's button alone when the old save ends in %s",
    async (_label, result, upload) => {
      let finishResult: () => void = () => {};
      const gate = new Promise<void>((resolve) => {
        finishResult = resolve;
      });
      stubFetch(() => gate.then(result), upload);

      const view = renderPanel();
      await clickSave();
      expect(screen.getByText(en.common.saving)).toBeTruthy();

      view.rerender(panel("resize", "/api/v1/download/job-2/b-resized.png"));
      expect(saveButtonNamed(en.toolPage.saveToFiles).disabled).toBe(false);

      await act(async () => {
        finishResult();
      });

      expect(saveButtonNamed(en.toolPage.saveToFiles).disabled).toBe(false);
      expect(screen.queryByText(en.toolPage.resultExpired)).toBeNull();
      expect(screen.queryByText(en.toolPage.libraryFull)).toBeNull();
      expect(screen.queryByText(en.toolPage.savedToFiles)).toBeNull();
    },
  );

  it("drops a sticky reason when the next attempt fails generically", async () => {
    vi.useFakeTimers();
    let results = 0;
    stubFetch(
      () => {
        results += 1;
        return results === 1 ? okResult() : failedResult(500)();
      },
      () => Promise.resolve(quotaResponse()),
    );

    renderPanel();
    await clickSave();
    fireEvent.click(saveButtonNamed(en.toolPage.libraryFull));
    await act(async () => {});

    expect(screen.getByText(en.common.error)).toBeTruthy();
    expect(screen.queryByText(en.toolPage.libraryFull)).toBeNull();

    await act(async () => {
      vi.advanceTimersByTime(3000);
    });
    expect(saveButtonNamed(en.toolPage.saveToFiles).disabled).toBe(false);
  });

  it("keeps a sticky reason when an earlier generic error's timer runs out", async () => {
    vi.useFakeTimers();
    let results = 0;
    stubFetch(
      () => {
        results += 1;
        return results === 1 ? failedResult(500)() : okResult();
      },
      () => Promise.resolve(quotaResponse()),
    );

    renderPanel();
    await clickSave();
    expect(screen.getByText(en.common.error)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(1000);
    });
    fireEvent.click(saveButtonNamed(en.common.error));
    await act(async () => {});
    expect(screen.getByText(en.toolPage.libraryFull)).toBeTruthy();

    await act(async () => {
      vi.advanceTimersByTime(5000);
    });
    expect(screen.getByText(en.toolPage.libraryFull)).toBeTruthy();
  });
});
