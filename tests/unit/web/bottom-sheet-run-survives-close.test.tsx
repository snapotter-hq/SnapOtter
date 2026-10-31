// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));
vi.mock("@/lib/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Map<string, string>(),
  parseApiError: () => "error",
}));
vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, generateId: () => "33333333-3333-4333-8333-333333333333" };
});

import { BottomSheet } from "@/components/common/bottom-sheet";
import { useToolProcessor } from "@/hooks/use-tool-processor";
import { useFileStore } from "@/stores/file-store";

/**
 * #1974: on a phone a tool's settings panel, and the run it owns, lives inside
 * the BottomSheet. The panel's own cleanup aborts the request and closes the
 * progress stream, so a sheet that unmounts it when closed ends the run without
 * clearing `processing`. Here the real processor hook sits in a kept-mounted
 * sheet and the sheet is shut mid-run.
 */

class MockEventSource {
  static OPEN = 1;
  static instances: MockEventSource[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  readyState = MockEventSource.OPEN;
  close = vi.fn(() => {
    this.readyState = 2;
  });
  constructor(readonly url: string) {
    MockEventSource.instances.push(this);
  }
}

interface MockXhr {
  status: number;
  responseText: string;
  timeout: number;
  upload: { onprogress?: unknown; onload?: (() => void) | null };
  onload?: () => void;
  open: ReturnType<typeof vi.fn>;
  send: ReturnType<typeof vi.fn>;
  setRequestHeader: ReturnType<typeof vi.fn>;
  abort: ReturnType<typeof vi.fn>;
}

let xhrs: MockXhr[];

const JOB_ID = "33333333-3333-4333-8333-333333333333";

function Panel() {
  const { processFiles } = useToolProcessor("trim-video");
  return (
    <button
      type="button"
      onClick={() => processFiles(useFileStore.getState().files, { startS: 0, endS: 2 })}
    >
      run
    </button>
  );
}

function SheetWithToggle() {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        toggle
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} keepMounted>
        <Panel />
      </BottomSheet>
    </>
  );
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...globalThis.URL,
    createObjectURL: vi.fn(() => "blob:fake-url"),
    revokeObjectURL: vi.fn(),
  });
  useFileStore.getState().reset();
  xhrs = [];
  MockEventSource.instances = [];
  vi.stubGlobal("EventSource", MockEventSource);
  vi.stubGlobal(
    "XMLHttpRequest",
    vi.fn(() => {
      const xhr: MockXhr = {
        status: 0,
        responseText: "",
        timeout: 0,
        upload: {},
        open: vi.fn(),
        send: vi.fn(),
        setRequestHeader: vi.fn(),
        abort: vi.fn(),
      };
      xhrs.push(xhr);
      return xhr;
    }),
  );
});

afterEach(() => {
  cleanup();
  // The store revokes its blob URLs on reset, which needs the stub still in place.
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("a run in a closed, kept-mounted settings sheet (#1974)", () => {
  it("keeps its request and progress stream alive and lands the result", () => {
    const file = new File([new ArrayBuffer(64)], "clip.mp4", { type: "video/mp4" });
    useFileStore.getState().setFiles([file]);
    render(<SheetWithToggle />);
    fireEvent.click(screen.getByText("run"));
    expect(useFileStore.getState().processing).toBe(true);

    fireEvent.click(screen.getByText("toggle"));

    expect(xhrs).toHaveLength(1);
    expect(xhrs[0].abort).not.toHaveBeenCalled();
    expect(MockEventSource.instances.at(-1)?.close).not.toHaveBeenCalled();
    expect(useFileStore.getState().processing).toBe(true);

    act(() => {
      xhrs[0].upload.onload?.();
      MockEventSource.instances.at(-1)?.onmessage?.({
        data: JSON.stringify({
          type: "single",
          jobId: JOB_ID,
          phase: "complete",
          percent: 100,
          result: {
            jobId: "server-job",
            downloadUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
            originalSize: 64,
            processedSize: 32,
          },
        }),
      } as MessageEvent);
    });

    expect(useFileStore.getState().processing).toBe(false);
    expect(useFileStore.getState().entries[0]).toMatchObject({
      status: "completed",
      processedUrl: "/api/v1/download/server-job/clip_trimmed.mp4",
    });
  });
});
