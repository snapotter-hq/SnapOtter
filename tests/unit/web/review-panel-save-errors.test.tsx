// @vitest-environment jsdom
import { ANALYTICS_EVENTS, isSafeMessageError } from "@snapotter/shared";
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

function renderPanel(currentToolId = "resize") {
  return render(
    <MemoryRouter>
      <ReviewPanel
        filename="a-resized.png"
        fileSize={100}
        fileType="image/png"
        originalSize={200}
        downloadUrl={RESULT_URL}
        onUndo={() => {}}
        onStartOver={() => {}}
        currentToolId={currentToolId}
      />
    </MemoryRouter>,
  );
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
    expect(screen.getByText("An error occurred")).toBeTruthy();
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

  // Over quota, signed out, or not allowed: about the user's own account, and
  // nothing for us to fix, so shown but not reported.
  it.each([401, 403, 413])("shows but does not report an upload %i", async (status) => {
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
      () => Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }),
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
          ? Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) })
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
      () => Promise.resolve({ ok: false, status: 404, blob: () => Promise.resolve(new Blob()) }),
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
