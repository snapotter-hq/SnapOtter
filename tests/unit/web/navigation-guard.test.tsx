// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { NavigationGuard } from "@/components/common/navigation-guard";
import { useEditorStore } from "@/stores/editor-store";
import { useFileStore } from "@/stores/file-store";

const TOOL_ROUTE = "/image/compress-image";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

/**
 * A data router, not MemoryRouter: the guard will call useBlocker, which only
 * exists on a data router, so the harness has to be one from the start.
 */
function renderGuard(path = TOOL_ROUTE) {
  const router = createMemoryRouter([{ path: "*", element: <NavigationGuard /> }], {
    initialEntries: [path],
  });
  return render(<RouterProvider router={router} />);
}

/**
 * What the window was actually handed, filtered to the one event under test.
 * Registration is the assertion, not just behaviour: a listener that is always
 * attached and returns early can disqualify the page from bfcache.
 */
function calls(spy: ReturnType<typeof vi.spyOn>): unknown[][] {
  return spy.mock.calls.filter((call) => call[0] === "beforeunload");
}

/**
 * Fire a real cancelable beforeunload and report how the page answered.
 *
 * `prevented` alone is not enough to pin the handler. jsdom dispatches a plain
 * Event, whose legacy `returnValue` setter cancels on a FALSY value, so a
 * handler that only assigned `returnValue = ""` would read as cancelled here
 * while doing nothing in any real browser. `preventDefaultCalled` pins the one
 * mechanism current browsers honour.
 */
function dispatchUnload(): { prevented: boolean; preventDefaultCalled: boolean } {
  const event = new Event("beforeunload", { cancelable: true });
  const preventDefault = vi.spyOn(event, "preventDefault");
  window.dispatchEvent(event);
  return {
    prevented: event.defaultPrevented,
    preventDefaultCalled: preventDefault.mock.calls.length > 0,
  };
}

let addSpy: ReturnType<typeof vi.spyOn>;
let removeSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  useFileStore.getState().reset();
  useEditorStore.setState({ isDirty: false });
  addSpy = vi.spyOn(window, "addEventListener");
  removeSpy = vi.spyOn(window, "removeEventListener");
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("NavigationGuard beforeunload listener", () => {
  it("registers no listener when there is nothing to lose", () => {
    renderGuard();

    expect(calls(addSpy)).toHaveLength(0);
    expect(dispatchUnload().prevented).toBe(false);
  });

  it("registers a listener while a run is in flight", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessing(true);

    renderGuard();

    expect(calls(addSpy)).toHaveLength(1);
  });

  it("registers a listener once a result is sitting untaken", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore
      .getState()
      .updateEntry(0, { processedUrl: "blob:result", processedFilename: "a-small.png" });

    renderGuard();

    expect(calls(addSpy)).toHaveLength(1);
  });

  it("registers a listener for an unsaved editor document", () => {
    useEditorStore.setState({ isDirty: true });

    renderGuard("/editor");

    expect(calls(addSpy)).toHaveLength(1);
    expect(dispatchUnload().preventDefaultCalled).toBe(true);
  });

  it("leaves a clean editor document alone", () => {
    renderGuard("/editor");

    expect(calls(addSpy)).toHaveLength(0);
  });

  // The path a user actually takes: land on an empty tool page, then start a
  // run. Nothing registers at mount, so the effect has to re-run off the dep
  // array when hasWork flips.
  it("registers a listener when work appears after mount", () => {
    renderGuard();
    expect(calls(addSpy)).toHaveLength(0);

    act(() => {
      useFileStore.getState().setFiles([makeFile("a.png")]);
      useFileStore.getState().setProcessing(true);
    });

    expect(calls(addSpy)).toHaveLength(1);
    expect(dispatchUnload().preventDefaultCalled).toBe(true);
  });

  it("removes the listener it added once the run settles with nothing left", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessing(true);

    renderGuard();
    act(() => {
      useFileStore.getState().setProcessing(false);
    });

    const added = calls(addSpy);
    const removed = calls(removeSpy);
    expect(added).toHaveLength(1);
    expect(removed).toHaveLength(1);
    // The cleanup has to hand back the same function object, or the listener
    // outlives the work it was guarding.
    expect(removed[0][1]).toBe(added[0][1]);
    expect(dispatchUnload().prevented).toBe(false);
  });

  it("cancels the unload while there is work in flight", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessing(true);

    renderGuard();

    const { prevented, preventDefaultCalled } = dispatchUnload();
    expect(preventDefaultCalled).toBe(true);
    expect(prevented).toBe(true);
  });

  it("leaves the unload alone on a page that owns no work", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    useFileStore.getState().setProcessing(true);

    renderGuard("/files");

    expect(calls(addSpy)).toHaveLength(0);
    expect(dispatchUnload().prevented).toBe(false);
  });
});
