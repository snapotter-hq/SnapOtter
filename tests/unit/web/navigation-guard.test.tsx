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

/**
 * jsdom ships no URL.createObjectURL and the file store needs one. A subclass,
 * not the usual plain-object stub: the router builds `new URL(...)` on every
 * navigation, so the global has to stay constructable.
 */
class MockURL extends URL {
  static createObjectURL = (): string => "blob:fake";
  static revokeObjectURL = (): void => {};
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
  vi.stubGlobal("URL", MockURL);
  vi.stubGlobal("Request", MockRequest);
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
