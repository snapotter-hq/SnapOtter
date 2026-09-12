// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { createMemoryRouter, Navigate, RouterProvider } from "react-router";
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

let mintedObjectUrls = 0;

/**
 * jsdom ships no URL.createObjectURL and the file store needs one. A subclass,
 * not the usual plain-object stub: the router builds `new URL(...)` on every
 * navigation, so the global has to stay constructable.
 *
 * Both halves are mocks, and every mint is a distinct string, so a test can say
 * WHICH url was revoked and WHEN. Against a constant url and a silent no-op
 * revoke, an assertion about blob lifetimes passes whatever the component does.
 */
class MockURL extends URL {
  static createObjectURL = vi.fn<() => string>();
  static revokeObjectURL = vi.fn<(url: string) => void>();
}

const NodeRequest = globalThis.Request;

/**
 * jsdom implements no fetch, so the `Request` in scope is Node's, and Node's
 * refuses jsdom's AbortSignal as a foreign brand. react-router builds one
 * Request per navigation, so without this every navigation throws. Node's
 * Request for everything else; only the signal is swapped past the check.
 */
class MockRequest extends NodeRequest {
  constructor(input: RequestInfo | URL, init: RequestInit = {}) {
    const { signal, ...rest } = init;
    super(input, rest);
    Object.defineProperty(this, "signal", {
      value: signal ?? new AbortController().signal,
    });
  }
}

/**
 * A data router, not MemoryRouter: the guard calls useBlocker, which only
 * exists on a data router, so the harness has to be one from the start.
 *
 * Takes a history rather than a single path so a test can drive POP, which
 * needs somewhere to go back to.
 */
function renderGuard(history: string | string[] = TOOL_ROUTE, index?: number) {
  const entries = Array.isArray(history) ? history : [history];
  const router = createMemoryRouter([{ path: "*", element: <NavigationGuard /> }], {
    initialEntries: entries,
    initialIndex: index,
  });
  return { ...render(<RouterProvider router={router} />), router };
}

type TestRouter = ReturnType<typeof createMemoryRouter>;

/** Drive the router the way a Link would, and let the blocker settle. */
async function navigateTo(router: TestRouter, to: string): Promise<void> {
  await act(async () => {
    await router.navigate(to);
  });
}

/**
 * Every blocker state the router passes through, so a test can assert on what
 * the blocker did rather than only on where the navigation landed. The
 * auto-proceed effect hides a spurious block from the second kind of check.
 */
function recordBlockerStates(router: TestRouter): { states: string[]; stop: () => void } {
  const states: string[] = [];
  const stop = router.subscribe((state) => {
    for (const blocker of state.blockers.values()) states.push(blocker.state);
  });
  return { states, stop };
}

function startRun(): void {
  useFileStore.getState().setFiles([makeFile("a.png")]);
  useFileStore.getState().setProcessing(true);
}

function leaveAResult(): void {
  useFileStore.getState().setFiles([makeFile("a.png")]);
  useFileStore
    .getState()
    .updateEntry(0, { processedUrl: "blob:result", processedFilename: "a-small.png" });
}

function leaveABatchZip(): void {
  useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
  useFileStore.getState().setBatchZip(new Blob(["zip"]), "processed-files.zip");
}

function leaveTwoResults(): void {
  useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
  useFileStore
    .getState()
    .updateEntry(0, { processedUrl: "blob:result-a", processedFilename: "a-small.png" });
  useFileStore
    .getState()
    .updateEntry(1, { processedUrl: "blob:result-b", processedFilename: "b-small.png" });
}

/**
 * What the page actually handed the browser, in order. The anchor click is the
 * only observable: triggerDownload builds an anchor, clicks it and drops it.
 */
function recordDownloads(): Array<{ url: string; filename: string }> {
  const started: Array<{ url: string; filename: string }> = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    started.push({ url: this.getAttribute("href") ?? "", filename: this.download });
  });
  return started;
}

/** Let the dialog's deferred claim-and-go run, on real timers. */
async function flushDeferredWork(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function clickButton(name: string): Promise<void> {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name }));
  });
}

/** The text an aria-labelledby or aria-describedby actually resolves to. */
function textOf(id: string | null): string | undefined {
  return id ? (document.getElementById(id)?.textContent ?? undefined) : undefined;
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
  mintedObjectUrls = 0;
  MockURL.createObjectURL.mockReset().mockImplementation(() => `blob:mock-${++mintedObjectUrls}`);
  MockURL.revokeObjectURL.mockReset();
  vi.stubGlobal("URL", MockURL);
  vi.stubGlobal("Request", MockRequest);
  useFileStore.getState().reset();
  useEditorStore.setState({ isDirty: false });
  addSpy = vi.spyOn(window, "addEventListener");
  removeSpy = vi.spyOn(window, "removeEventListener");
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
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
describe("NavigationGuard blocker", () => {
  it("blocks a navigation away from a run and keeps you put when you stay", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    expect(router.state.location.pathname).toBe(TOOL_ROUTE);
    expect(screen.getByRole("dialog")).toBeDefined();

    await clickButton(en.navigationGuard.stay);

    expect(router.state.location.pathname).toBe(TOOL_ROUTE);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("lets the navigation through when you leave anyway", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    expect(router.state.location.pathname).toBe(TOOL_ROUTE);

    await clickButton(en.navigationGuard.leave);

    expect(router.state.location.pathname).toBe("/files");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Back is how most people abandon a page, and POP runs through its own branch
  // of the router with a history rewind rather than the push path above.
  it("blocks the browser Back button out of a run", async () => {
    startRun();
    const { router } = renderGuard(["/files", TOOL_ROUTE], 1);

    await act(async () => {
      await router.navigate(-1);
    });

    expect(router.state.location.pathname).toBe(TOOL_ROUTE);
    expect(screen.getByRole("dialog")).toBeDefined();

    await clickButton(en.navigationGuard.leave);

    expect(router.state.location.pathname).toBe("/files");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders nothing while there is nothing to lose", async () => {
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    expect(router.state.location.pathname).toBe("/files");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The auto-proceed effect would paper over a blocker that fires with nothing
  // to lose, so watch the blocker state rather than where the router landed: a
  // clean page must never enter "blocked" in the first place.
  it("never enters the blocked state on a page with nothing to lose", async () => {
    const { router } = renderGuard();
    const seen = recordBlockerStates(router);

    await navigateTo(router, "/files");
    seen.stop();

    expect(router.state.location.pathname).toBe("/files");
    expect(seen.states).not.toContain("blocked");
  });

  it("stops asking once the work settles while the dialog is open", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    expect(screen.getByRole("dialog")).toBeDefined();

    await act(async () => {
      useFileStore.getState().setProcessing(false);
    });

    expect(router.state.location.pathname).toBe("/files");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Every store patch during a run rebuilds useWorkInFlight's return value, so
  // an open dialog re-renders repeatedly under a live run. This pins that the
  // block survives that; it does NOT pin the useCallback on shouldBlock, which
  // in react-router 8.3.0 only saves an effect re-run and is invisible from
  // outside. Verified: this passes with an inline arrow too.
  it("keeps asking while the store churns underneath it", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    expect(screen.getByRole("dialog")).toBeDefined();

    await act(async () => {
      for (const size of [10, 20, 30]) {
        useFileStore.getState().updateEntry(0, { status: "processing", processedSize: size });
      }
    });

    expect(router.state.location.pathname).toBe(TOOL_ROUTE);
    expect(screen.getByRole("dialog")).toBeDefined();
  });
});

describe("NavigationGuard blocker exemptions", () => {
  // Defence in depth. Nothing routes here in-app today, so the blocker never
  // sees these; the set is there for the first <Link to="/login"> someone adds.
  it("never blocks the way out to /login", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/login");

    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("never blocks the forced password change", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/change-password");

    expect(router.state.location.pathname).toBe("/change-password");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // automate-page navigates to its own path purely to clear router state.
  // Without the same-path check that pops a dialog over a no-op.
  it("never blocks a navigation to the path it is already on", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, TOOL_ROUTE);

    expect(router.state.location.pathname).toBe(TOOL_ROUTE);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // React Router tolerates a trailing slash, so this lands on the page the user
  // is already looking at. Comparing raw pathnames would call it a departure.
  it("never blocks the same path wearing a trailing slash", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, `${TOOL_ROUTE}/`);

    expect(router.state.location.pathname).toBe(`${TOOL_ROUTE}/`);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // Routes match case-insensitively unless they opt out, and none here do.
  it("never blocks the same path in a different case", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, TOOL_ROUTE.toUpperCase());

    expect(router.state.location.pathname).toBe(TOOL_ROUTE.toUpperCase());
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("NavigationGuard dialog copy", () => {
  it("names the run when a run is what is at risk", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    expect(screen.getByText(en.navigationGuard.processingTitle)).toBeDefined();
    expect(screen.getByText(en.navigationGuard.processingBody)).toBeDefined();
  });

  it("names the result when an untaken result is what is at risk", async () => {
    leaveAResult();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    expect(screen.getByText(en.navigationGuard.unsavedTitle)).toBeDefined();
    expect(screen.getByText(en.navigationGuard.unsavedBody)).toBeDefined();
  });

  // A batch settles by storing the zip before it fills in per-entry results, so
  // the zip is a reason on its own and not a consequence of the entries.
  it("names the result when an unclaimed batch zip is what is at risk", async () => {
    leaveABatchZip();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    expect(screen.getByText(en.navigationGuard.unsavedTitle)).toBeDefined();
    expect(screen.getByText(en.navigationGuard.unsavedBody)).toBeDefined();
  });

  it("names the edits when the editor is dirty", async () => {
    useEditorStore.setState({ isDirty: true });
    const { router } = renderGuard("/editor");

    await navigateTo(router, "/files");

    expect(screen.getByText(en.navigationGuard.editorTitle)).toBeDefined();
    expect(screen.getByText(en.navigationGuard.editorBody)).toBeDefined();
  });
});

describe("NavigationGuard dialog controls", () => {
  // Escape is the one key a user hits by reflex. Mapping it to Leave would turn
  // a stray keypress into data loss.
  it("treats Escape as staying put", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    expect(screen.getByRole("dialog")).toBeDefined();

    await act(async () => {
      fireEvent.keyDown(window, { key: "Escape" });
    });

    expect(router.state.location.pathname).toBe(TOOL_ROUTE);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // A misplaced click is the accident the dialog exists to catch, so the
  // backdrop answers nothing, in either direction.
  it("ignores a click on the backdrop", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    const backdrop = document.querySelector("[aria-hidden='true']");
    expect(backdrop).not.toBeNull();

    await act(async () => {
      fireEvent.click(backdrop as Element);
    });

    expect(router.state.location.pathname).toBe(TOOL_ROUTE);
    expect(screen.getByRole("dialog")).toBeDefined();
  });

  // Whatever the trap focuses first is what a reflexive Enter answers, so it
  // has to be the safe one.
  it("puts the focus on staying put, not on leaving", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.navigationGuard.stay }),
    );
  });
});

describe("NavigationGuard download then leave", () => {
  it("offers the download when an untaken result is what is at risk", async () => {
    leaveAResult();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    expect(screen.getByRole("button", { name: en.navigationGuard.downloadAndLeave })).toBeDefined();
  });

  // There is no result yet, so there is nothing the dialog could hand over.
  it("offers no download while the run is still going", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.queryByRole("button", { name: en.navigationGuard.downloadAndLeave })).toBeNull();
  });

  // The editor owns its own export path and hands the guard no downloads.
  it("offers no download for unsaved editor edits", async () => {
    useEditorStore.setState({ isDirty: true });
    const { router } = renderGuard("/editor");

    await navigateTo(router, "/files");

    expect(screen.getByRole("dialog")).toBeDefined();
    expect(screen.queryByRole("button", { name: en.navigationGuard.downloadAndLeave })).toBeNull();
  });

  // Whatever sits first is what the focus trap focuses and a reflexive Enter
  // answers, so the third button goes after staying put, never before it.
  it("keeps staying put first once there are three answers", async () => {
    leaveAResult();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    });

    expect(screen.getAllByRole("button").map((b) => b.textContent)).toEqual([
      en.navigationGuard.stay,
      en.navigationGuard.downloadAndLeave,
      en.navigationGuard.leave,
    ]);
    expect(document.activeElement).toBe(
      screen.getByRole("button", { name: en.navigationGuard.stay }),
    );
  });

  // The reason the claim and the proceed are deferred at all. Committing the
  // navigation remounts tool-page, whose reset() revokes the very url the
  // anchor was handed, so a commit in this tick can cancel a download the
  // browser has not started. Drop the setTimeout and the router is already on
  // /files by the time this looks.
  it("starts the download before it commits the navigation", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    leaveAResult();
    const started = recordDownloads();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);

    expect(started).toEqual([{ url: "blob:result", filename: "a-small.png" }]);
    expect(router.state.location.pathname).toBe(TOOL_ROUTE);

    await act(async () => {
      vi.runAllTimers();
    });

    expect(router.state.location.pathname).toBe("/files");
  });

  // Claiming drops hasWork, and the effect that gives up on work that settled
  // under the dialog would commit the navigation mid-download. Anything that
  // settles the store between the click and the deferred claim walks into it.
  it("does not auto-proceed while the download it started is pending", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    leaveAResult();
    recordDownloads();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);

    // The work settles from somewhere else while the download is in flight.
    await act(async () => {
      useFileStore.getState().markClaimed(0);
    });
    expect(router.state.location.pathname).toBe(TOOL_ROUTE);

    await act(async () => {
      vi.runAllTimers();
    });
    expect(router.state.location.pathname).toBe("/files");
  });

  // Two owners can answer one block: this action's deferred proceed, and the
  // effect that gives up on work that settled. The claim wakes that effect, and
  // it still holds the blocker from the blocked render, so a second proceed
  // lands on a block that is already gone. react-router throws that into an
  // error boundary rather than ignoring it.
  it("commits the navigation exactly once", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    leaveAResult();
    recordDownloads();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);
    await flushDeferredWork();

    expect(router.state.location.pathname).toBe("/files");
    expect(logged.mock.calls.flat().join(" ")).not.toContain("Invalid blocker state transition");
  });

  // The claim is fixed to what actually went out, by the indices the downloads
  // carry, and is not re-read from the store a tick later. A result that lands
  // in that window was never handed over, so claiming it would silence the
  // warning for a file nobody took, which is the loss this whole dialog exists
  // to prevent. optimize-for-web writes a live preview into the store as a
  // finished result with no run in flight, so this window is reachable (#1112).
  it("claims only what it downloaded, not a result that landed since", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore
      .getState()
      .updateEntry(0, { processedUrl: "blob:result-a", processedFilename: "a-small.png" });
    const started = recordDownloads();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);

    // The second entry finishes while the download is on its way out.
    await act(async () => {
      useFileStore
        .getState()
        .updateEntry(1, { processedUrl: "blob:result-b", processedFilename: "b-small.png" });
    });
    await act(async () => {
      vi.runAllTimers();
    });

    expect(started).toEqual([{ url: "blob:result-a", filename: "a-small.png" }]);
    expect(useFileStore.getState().entries.map((e) => e.claimed)).toEqual([true, false]);
    expect(router.state.location.pathname).toBe("/files");
  });

  // An impatient double click lands both clicks before the deferred tick, and
  // the dialog is still on screen for the second one.
  it("takes the result once however many times the button is clicked", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    leaveAResult();
    const started = recordDownloads();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);
    await clickButton(en.navigationGuard.downloadAndLeave);

    expect(started).toHaveLength(1);

    await act(async () => {
      vi.runAllTimers();
    });
    expect(router.state.location.pathname).toBe("/files");
    // A second queued leave would proceed on a block that is already answered.
    expect(logged.mock.calls.flat().join(" ")).not.toContain("Invalid blocker state transition");
  });

  // AuthGuard swaps this component out on session expiry, and useBlocker's
  // cleanup deletes the blocker on that unmount. A deferred leave that fires
  // afterwards proceeds on a blocker that is gone, which react-router throws
  // on, out of a timer where nothing catches it.
  it("drops its deferred leave when it is unmounted first", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let expireSession: () => void = () => {};

    function AuthLike() {
      const [authed, setAuthed] = useState(true);
      expireSession = () => setAuthed(false);
      return authed ? <NavigationGuard /> : <Navigate to="/login" replace />;
    }

    leaveAResult();
    recordDownloads();
    const router = createMemoryRouter([{ path: "*", element: <AuthLike /> }], {
      initialEntries: [TOOL_ROUTE],
    });
    render(<RouterProvider router={router} />);

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);
    await act(async () => {
      expireSession();
    });

    await act(async () => {
      vi.runAllTimers();
    });

    expect(router.state.location.pathname).toBe("/login");
  });

  // A zip is a raw Blob, so downloadBlob mints an object url for it and owns
  // revoking that url. Taking the zip takes every result in it.
  it("takes the batch zip once and claims the whole batch", async () => {
    leaveABatchZip();
    const started = recordDownloads();
    MockURL.createObjectURL.mockClear();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);
    await flushDeferredWork();

    expect(MockURL.createObjectURL).toHaveBeenCalledTimes(1);
    const zipUrl = MockURL.createObjectURL.mock.results[0].value;
    expect(started).toEqual([{ url: zipUrl, filename: "processed-files.zip" }]);
    expect(MockURL.revokeObjectURL).toHaveBeenCalledWith(zipUrl);

    const store = useFileStore.getState();
    expect(store.batchZipClaimed).toBe(true);
    expect(store.entries.every((e) => e.claimed)).toBe(true);
    expect(router.state.location.pathname).toBe("/files");
  });

  it("takes every unclaimed result and leaves a claimed one alone", async () => {
    leaveTwoResults();
    useFileStore.getState().markClaimed(0);
    const started = recordDownloads();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);
    await flushDeferredWork();

    expect(started).toEqual([{ url: "blob:result-b", filename: "b-small.png" }]);
    expect(useFileStore.getState().entries.map((e) => e.claimed)).toEqual([true, true]);
    expect(router.state.location.pathname).toBe("/files");
  });

  // The store minted the result url and revokes it in reset(); revoking it here
  // pulls it out from under the download, and from under the preview still on
  // screen. Cleared after the setup so this is about what the dialog did.
  it("never revokes the result url the store still owns", async () => {
    leaveAResult();
    recordDownloads();
    MockURL.revokeObjectURL.mockClear();
    const { router } = renderGuard();

    await navigateTo(router, "/files");
    await clickButton(en.navigationGuard.downloadAndLeave);
    await flushDeferredWork();

    expect(MockURL.revokeObjectURL.mock.calls.flat()).not.toContain("blob:result");
    expect(useFileStore.getState().entries[0].processedUrl).toBe("blob:result");
    expect(router.state.location.pathname).toBe("/files");
  });
});

describe("NavigationGuard dialog markup", () => {
  it("names itself and its question for assistive tech", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(textOf(dialog.getAttribute("aria-labelledby"))).toBe(en.navigationGuard.processingTitle);
    expect(textOf(dialog.getAttribute("aria-describedby"))).toBe(en.navigationGuard.processingBody);
  });

  // German runs 59 display units across the three labels and Japanese 52,
  // against 20 for English's widest, so a row overflows the card.
  it("stacks its buttons instead of laying them out in a row", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    const stay = screen.getByRole("button", { name: en.navigationGuard.stay });
    const leave = screen.getByRole("button", { name: en.navigationGuard.leave });
    expect(stay.parentElement).toBe(leave.parentElement);
    expect(stay.parentElement?.className).toContain("flex-col");
  });

  // The migration banner is z-[55] and the connection banner z-[60], and the
  // survey overlay shares z-50 but paints after this one. aria-modal tells
  // assistive tech there is nothing else here; the stacking order has to agree
  // for the mouse.
  it("sits above the app's other fixed layers", async () => {
    startRun();
    const { router } = renderGuard();

    await navigateTo(router, "/files");

    const shell = screen.getByRole("dialog").closest(".fixed");
    const layer = Number(/z-\[(\d+)\]/.exec(shell?.className ?? "")?.[1] ?? 0);
    expect(layer).toBeGreaterThan(60);
  });
});

/**
 * These two characterize an upstream contract rather than anything this
 * component decides: React runs passive unmount effects tree-wide before
 * passive mount effects, and useBlocker's cleanup lives in a passive effect
 * rather than a layout one. That pairing is what deletes the blocker before
 * AuthGuard's <Navigate> gets to navigate.
 *
 * Neither can be broken from inside the component, because the component is not
 * what makes them pass. They exist to fail on a react-router upgrade that moves
 * deleteBlocker into a layout effect, which is exactly the AuthGuard deadlock.
 */
describe("NavigationGuard unmount ordering", () => {
  it("lets the session-expiry redirect through instead of deadlocking", async () => {
    let expireSession: () => void = () => {};

    function AuthLike() {
      const [authed, setAuthed] = useState(true);
      expireSession = () => setAuthed(false);
      return authed ? <NavigationGuard /> : <Navigate to="/login" replace />;
    }

    startRun();
    const router = createMemoryRouter([{ path: "*", element: <AuthLike /> }], {
      initialEntries: [TOOL_ROUTE],
    });
    render(<RouterProvider router={router} />);

    await act(async () => {
      expireSession();
    });

    expect(router.state.location.pathname).toBe("/login");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The same ordering with a destination the exemption list does not cover, so
  // the exemption cannot be what carries it.
  it("does not block a redirect fired from the commit that unmounts it", async () => {
    let signOut: () => void = () => {};

    function RedirectOnUnmount() {
      const [mounted, setMounted] = useState(true);
      signOut = () => setMounted(false);
      return mounted ? <NavigationGuard /> : <Navigate to="/files" replace />;
    }

    startRun();
    const router = createMemoryRouter([{ path: "*", element: <RedirectOnUnmount /> }], {
      initialEntries: [TOOL_ROUTE],
    });
    render(<RouterProvider router={router} />);

    await act(async () => {
      signOut();
    });

    expect(router.state.location.pathname).toBe("/files");
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
