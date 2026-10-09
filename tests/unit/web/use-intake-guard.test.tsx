// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The toast is sonner's; what matters here is when it is shown and with what text.
const showIgnored = vi.hoisted(() => vi.fn());
vi.mock("@/lib/intake-notice", () => ({ showIntakeIgnored: showIgnored }));

import { useIntakeGuard } from "@/hooks/use-intake-guard";
import { useFileStore } from "@/stores/file-store";

/**
 * #2108: a file dropped or pasted onto a tool page replaces the loaded one, and
 * the single-file runs watch the store and stop when their file leaves it
 * (#1894, #1975). Mid-run that ended the run with no message, so the guard turns
 * the intake away and says why.
 */

beforeEach(() => {
  showIgnored.mockClear();
  useFileStore.getState().reset();
});

afterEach(() => {
  useFileStore.getState().reset();
});

describe("useIntakeGuard (#2108)", () => {
  it("lets files in when nothing is running, without a word", () => {
    const { result } = renderHook(() => useIntakeGuard());

    expect(result.current()).toBe(true);
    expect(showIgnored).not.toHaveBeenCalled();
  });

  it("turns files away while a run is in flight, and says why", () => {
    useFileStore.getState().setProcessing(true);
    const { result } = renderHook(() => useIntakeGuard());

    expect(result.current()).toBe(false);

    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
  });

  it("reads the store when asked, not when the hook rendered", () => {
    const { result } = renderHook(() => useIntakeGuard());
    expect(result.current()).toBe(true);

    // The run starts after the page rendered, as it does between two drops.
    useFileStore.getState().setProcessing(true);

    expect(result.current()).toBe(false);
    useFileStore.getState().setProcessing(false);
    expect(result.current()).toBe(true);
  });
});
