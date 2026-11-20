// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ hasPermission: () => true }) }));

vi.mock("@/lib/cancel-abandoned-job", () => ({
  cancelAbandonedJob: vi.fn(async () => {}),
}));

import { en } from "@snapotter/shared";
import { PassportPhotoSettings } from "@/components/tools/passport-photo-settings";
import { cancelAbandonedJob } from "@/lib/cancel-abandoned-job";
import { useFileStore } from "@/stores/file-store";
import {
  type AnalyzeResult,
  passportFileKey,
  usePassportPhotoStore,
} from "@/stores/passport-photo-store";

/**
 * #4337: generate is a queued job now. Past the sync window the server answers
 * 202 and the result arrives on the job's progress stream, so the panel has to
 * follow that stream instead of reading the 202 body as the result.
 */

class FakeEventSource {
  static OPEN = 1;
  static instances: FakeEventSource[] = [];

  readonly url: string;
  readyState = FakeEventSource.OPEN;
  onmessage: ((event: { data: string }) => void) | null = null;
  onerror: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  emit(frame: Record<string, unknown>) {
    this.onmessage?.({ data: JSON.stringify(frame) });
  }

  close() {
    this.readyState = 2;
  }
}

const ANALYZE_RESULT: AnalyzeResult = {
  preview: "",
  landmarks: {
    leftEye: { x: 0.42, y: 0.4 },
    rightEye: { x: 0.58, y: 0.4 },
    eyeCenter: { x: 0.5, y: 0.4 },
    chin: { x: 0.5, y: 0.62 },
    forehead: { x: 0.5, y: 0.25 },
    crown: { x: 0.5, y: 0.18 },
    nose: { x: 0.5, y: 0.5 },
    faceCenterX: 0.5,
  },
  imageWidth: 900,
  imageHeight: 1200,
  jobId: "analyze-job-1",
  filename: "photo.png",
};

const fetchMock = vi.fn();

function accepted(progressJobId: string) {
  return Promise.resolve(
    new Response(
      JSON.stringify({
        jobId: progressJobId,
        progressJobId,
        artifactJobId: "artifact-1",
        async: true,
        statusUrl: `/api/v1/jobs/${progressJobId}`,
        progressUrl: `/api/v1/jobs/${progressJobId}/progress`,
      }),
      { status: 202, headers: { "Content-Type": "application/json" } },
    ),
  );
}

/** Render the panel with an analysis in hand, so only generate talks to the server. */
function renderAnalyzed() {
  const file = new File(["png"], "photo.png", { type: "image/png" });
  useFileStore.getState().setFiles([file]);
  const entryId = useFileStore.getState().entries[0]?.id;
  usePassportPhotoStore.getState().setAnalyzedFileKey(passportFileKey(file, entryId));
  usePassportPhotoStore.getState().setAnalyzeResult(ANALYZE_RESULT);
  render(<PassportPhotoSettings />);
}

async function generateAndAccept(): Promise<{
  body: Record<string, unknown>;
  es: FakeEventSource;
}> {
  fetchMock.mockImplementation((_url: string, init: RequestInit) => {
    const sent = JSON.parse(String(init.body)) as Record<string, unknown>;
    return accepted(String(sent.clientJobId));
  });
  fireEvent.click(screen.getByTestId("passport-photo-generate"));
  await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
  const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as Record<string, unknown>;
  return { body, es: FakeEventSource.instances[0] };
}

beforeEach(() => {
  FakeEventSource.instances = [];
  vi.stubGlobal("EventSource", FakeEventSource);
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
  vi.mocked(cancelAbandonedJob).mockClear();
  useFileStore.getState().reset();
  usePassportPhotoStore.getState().reset();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useFileStore.getState().reset();
  usePassportPhotoStore.getState().reset();
});

describe("passport-photo generate after a 202", () => {
  it("sends a clientJobId and shows the download once the stream completes", async () => {
    renderAnalyzed();
    const { body, es } = await generateAndAccept();

    expect(typeof body.clientJobId).toBe("string");
    expect(es.url).toContain(`/api/v1/jobs/${String(body.clientJobId)}/progress`);
    expect(
      screen.queryByRole("link", { name: en.toolSettings["passport-photo"].downloadPhoto }),
    ).toBeNull();

    act(() => {
      es.emit({ type: "single", phase: "processing", percent: 40 });
      es.emit({
        type: "single",
        phase: "complete",
        percent: 100,
        result: {
          jobId: "artifact-1",
          downloadUrl: "/api/v1/download/artifact-1/photo_passport.jpg",
        },
      });
    });

    const link = await screen.findByRole("link", {
      name: en.toolSettings["passport-photo"].downloadPhoto,
    });
    expect(link.getAttribute("href")).toContain("/api/v1/download/artifact-1/photo_passport.jpg");
    expect(usePassportPhotoStore.getState().generating).toBe(false);
    expect(cancelAbandonedJob).not.toHaveBeenCalled();
  });

  it("shows the failed frame's reason and leaves the settled job alone", async () => {
    renderAnalyzed();
    const { es } = await generateAndAccept();

    act(() => {
      es.emit({
        type: "single",
        phase: "failed",
        percent: 0,
        error: "Passport photo generation failed",
        details: "Couldn't get this photo under 10 KB at the required dimensions.",
      });
    });

    await waitFor(() => expect(usePassportPhotoStore.getState().generating).toBe(false));
    expect(usePassportPhotoStore.getState().generateError).toBeTruthy();
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
    expect(cancelAbandonedJob).not.toHaveBeenCalled();
  });

  it("cancels the queued job when the run is reset before it finishes", async () => {
    renderAnalyzed();
    const { body, es } = await generateAndAccept();

    act(() => {
      usePassportPhotoStore.getState().reset();
    });

    await waitFor(() =>
      expect(cancelAbandonedJob).toHaveBeenCalledWith(String(body.clientJobId), "passport-photo"),
    );
    expect(es.readyState).toBe(2);
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
  });
});
