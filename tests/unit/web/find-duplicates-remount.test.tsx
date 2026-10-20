// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { en } from "@snapotter/shared";
import { FindDuplicatesResults } from "@/components/tools/find-duplicates-results";
import { FindDuplicatesSettings } from "@/components/tools/find-duplicates-settings";
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFileStore } from "@/stores/file-store";

/**
 * #2314: the panel aborted its scan when it unmounted, and the next mount reset the
 * duplicate store, so a scan the user started simply vanished when the window
 * crossed the layout breakpoint. The scan's state and results already live in the
 * duplicate store, so it now finishes in the background and the remounted panel
 * picks it up, including its error.
 */

class FakeXhr {
  static instances: FakeXhr[] = [];
  status = 0;
  responseText = "";
  timeout = 0;
  upload: { onprogress: unknown } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeout: (() => void) | null = null;
  aborted = false;
  constructor() {
    FakeXhr.instances.push(this);
  }
  open() {}
  setRequestHeader() {}
  send() {}
  abort() {
    this.aborted = true;
  }
  respond(status: number, body: unknown) {
    act(() => {
      this.status = status;
      this.responseText = JSON.stringify(body);
      this.onload?.();
    });
  }
  respondRaw(status: number, text: string) {
    act(() => {
      this.status = status;
      this.responseText = text;
      this.onload?.();
    });
  }
}

const RESULT = { totalImages: 2, uniqueImages: 2, spaceSaveable: 0, duplicateGroups: [] };

function image(name: string) {
  return new File(["png"], name, { type: "image/png" });
}

function startScan() {
  const view = render(<FindDuplicatesSettings />);
  fireEvent.click(screen.getByTestId("find-duplicates-submit"));
  return view;
}

let blobCount = 0;

beforeEach(() => {
  blobCount = 0;
  URL.createObjectURL = vi.fn(() => `blob:mock-${++blobCount}`);
  URL.revokeObjectURL = vi.fn();
  FakeXhr.instances = [];
  vi.stubGlobal("XMLHttpRequest", FakeXhr);
  useDuplicateStore.getState().reset();
  useFileStore.getState().reset();
  useFileStore.getState().setFiles([image("one.png"), image("two.png")]);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useDuplicateStore.getState().reset();
  useFileStore.getState().reset();
});

describe("find duplicates across a remount (#2314)", () => {
  it("does not abort its scan when it unmounts", () => {
    const { unmount } = startScan();
    expect(useDuplicateStore.getState().scanning).toBe(true);

    unmount();

    expect(FakeXhr.instances[0].aborted).toBe(false);
  });

  it("keeps the scan running on the remounted panel, and lands its results", () => {
    const { unmount } = startScan();
    unmount();

    render(<FindDuplicatesSettings />);
    // The remount must not wipe a scan that is still out.
    expect(useDuplicateStore.getState().scanning).toBe(true);

    FakeXhr.instances[0].respond(200, RESULT);

    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(useDuplicateStore.getState().results).toEqual(RESULT);
  });

  it("shows a scan's failure on the panel that remounted over it", () => {
    const { unmount } = startScan();
    unmount();
    render(<FindDuplicatesSettings />);

    FakeXhr.instances[0].respond(500, { error: "The scan fell over" });

    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(screen.getByText("The scan fell over")).toBeVisible();
  });

  it("drops the answer when the files were replaced while the scan was out", () => {
    startScan();
    act(() => {
      useFileStore.getState().setFiles([image("three.png"), image("four.png")]);
    });

    FakeXhr.instances[0].respond(200, RESULT);

    expect(useDuplicateStore.getState().results).toBeNull();
    expect(useDuplicateStore.getState().scanning).toBe(false);
  });

  it("drops the answer when the page cleared the files while the scan was out", () => {
    const { unmount } = startScan();
    unmount();
    act(() => {
      useFileStore.getState().reset();
      useDuplicateStore.getState().reset();
    });

    FakeXhr.instances[0].respond(200, RESULT);

    expect(useDuplicateStore.getState().results).toBeNull();
  });

  it("still starts a fresh mount from a clean store when no scan is running", () => {
    useDuplicateStore.getState().setResults(RESULT);

    render(<FindDuplicatesSettings />);

    expect(useDuplicateStore.getState().results).toBeNull();
  });

  it("shows a network failure on the panel that started the scan", () => {
    startScan();

    act(() => {
      FakeXhr.instances[0].onerror?.();
    });

    expect(useDuplicateStore.getState().scanning).toBe(false);
    expect(screen.getByText(/Network error/)).toBeVisible();
  });

  it("rejects malformed 2xx scan payloads without crashing FindDuplicatesSettings or FindDuplicatesResults (#3142)", () => {
    const validFile = {
      filename: "one.png",
      similarity: 100,
      width: 100,
      height: 100,
      fileSize: 500,
      format: "png",
      isBest: true,
      thumbnail: null,
    };
    const validGroup = {
      groupId: 1,
      files: [validFile, { ...validFile, filename: "two.png", isBest: false }],
    };

    const malformedBodies: Array<() => void> = [
      () => FakeXhr.instances.at(-1)?.respond(200, {}),
      () => FakeXhr.instances.at(-1)?.respond(200, null),
      () => FakeXhr.instances.at(-1)?.respond(200, []),
      () =>
        FakeXhr.instances.at(-1)?.respond(200, {
          totalImages: "2",
          uniqueImages: 2,
          spaceSaveable: 0,
          duplicateGroups: [],
        }),
      () =>
        FakeXhr.instances.at(-1)?.respond(200, {
          totalImages: 2,
          uniqueImages: -1,
          spaceSaveable: 0,
          duplicateGroups: [],
        }),
      () =>
        FakeXhr.instances.at(-1)?.respond(200, {
          totalImages: 2,
          uniqueImages: 2,
          spaceSaveable: 0,
          duplicateGroups: null,
        }),
      () =>
        FakeXhr.instances.at(-1)?.respond(200, {
          totalImages: 2,
          uniqueImages: 0,
          spaceSaveable: 500,
          duplicateGroups: [{ groupId: 1, files: [] }],
        }),
      () =>
        FakeXhr.instances.at(-1)?.respond(200, {
          totalImages: 2,
          uniqueImages: 0,
          spaceSaveable: 500,
          duplicateGroups: [{ groupId: 1, files: [{ filename: "one.png" }] }],
        }),
      () =>
        FakeXhr.instances.at(-1)?.respond(200, {
          totalImages: 2,
          uniqueImages: 0,
          spaceSaveable: 500,
          duplicateGroups: [validGroup],
          skippedFiles: "bad",
        }),
      () =>
        FakeXhr.instances.at(-1)?.respond(200, {
          totalImages: 2,
          uniqueImages: 0,
          spaceSaveable: 500,
          duplicateGroups: [validGroup],
          skippedFiles: [{ filename: "bad.png", reason: "" }],
        }),
      () => FakeXhr.instances.at(-1)?.respondRaw(200, "<html>proxy gateway ok</html>"),
    ];

    render(
      <>
        <FindDuplicatesSettings />
        <FindDuplicatesResults />
      </>,
    );

    for (const respondBad of malformedBodies) {
      act(() => {
        useDuplicateStore.setState({ error: null });
      });
      fireEvent.click(screen.getByTestId("find-duplicates-submit"));
      respondBad();

      const state = useDuplicateStore.getState();
      expect(state.error).toBe(en.errors.invalidServerResponse);
      expect(state.results).toBeNull();
      expect(state.scanning).toBe(false);
      expect(screen.getByText(en.errors.invalidServerResponse)).toBeInTheDocument();
      expect(screen.getByTestId("find-duplicates-submit")).toBeEnabled();
    }
  });
});
