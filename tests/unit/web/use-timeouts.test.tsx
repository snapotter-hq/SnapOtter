// @vitest-environment jsdom

/**
 * useTimeouts() schedules delayed state resets that die with the component
 * (#1619). A keyed call replaces the pending timer for the same key, so a
 * second "Saved" or "Copied" inside the fade window gets its full time instead
 * of being cleared by the first one's timer (#1798).
 */

import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTimeouts } from "@/hooks/use-timeouts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe("useTimeouts", () => {
  it("runs an unkeyed callback after its delay", () => {
    const { result } = renderHook(() => useTimeouts());
    const fired = vi.fn();
    result.current(fired, 3000);
    vi.advanceTimersByTime(2999);
    expect(fired).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fired).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps every unkeyed timer, however close together", () => {
    const { result } = renderHook(() => useTimeouts());
    const first = vi.fn();
    const second = vi.fn();
    result.current(first, 3000);
    vi.advanceTimersByTime(2000);
    result.current(second, 3000);
    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledOnce();
    expect(second).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2000);
    expect(second).toHaveBeenCalledOnce();
  });

  it("replaces the pending timer for the same key", () => {
    const { result } = renderHook(() => useTimeouts());
    const first = vi.fn();
    const second = vi.fn();
    result.current(first, 3000, "msg");
    vi.advanceTimersByTime(2000);
    result.current(second, 3000, "msg");
    expect(vi.getTimerCount()).toBe(1);

    // +3 s: the first timer would have fired here, and must not.
    vi.advanceTimersByTime(1000);
    expect(first).not.toHaveBeenCalled();
    expect(second).not.toHaveBeenCalled();

    // +5 s: the second one gets its full 3 s.
    vi.advanceTimersByTime(2000);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves other keys and unkeyed timers alone", () => {
    const { result } = renderHook(() => useTimeouts());
    const a = vi.fn();
    const b = vi.fn();
    const plain = vi.fn();
    result.current(a, 1000, "a");
    result.current(b, 1000, "b");
    result.current(plain, 1000);
    result.current(vi.fn(), 5000, "c");
    vi.advanceTimersByTime(1000);
    expect(a).toHaveBeenCalledOnce();
    expect(b).toHaveBeenCalledOnce();
    expect(plain).toHaveBeenCalledOnce();
  });

  it("schedules a key again once its timer has fired", () => {
    const { result } = renderHook(() => useTimeouts());
    const first = vi.fn();
    const second = vi.fn();
    result.current(first, 1000, "msg");
    vi.advanceTimersByTime(1000);
    result.current(second, 1000, "msg");
    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears keyed and unkeyed timers on unmount", () => {
    const { result, unmount } = renderHook(() => useTimeouts());
    const keyed = vi.fn();
    const plain = vi.fn();
    result.current(keyed, 1000, "msg");
    result.current(plain, 1000);
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    vi.advanceTimersByTime(1000);
    expect(keyed).not.toHaveBeenCalled();
    expect(plain).not.toHaveBeenCalled();
  });

  it("schedules nothing after unmount, keyed or not", () => {
    const { result, unmount } = renderHook(() => useTimeouts());
    const later = result.current;
    unmount();
    later(vi.fn(), 1000, "msg");
    later(vi.fn(), 1000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("returns the same function across renders", () => {
    const { result, rerender } = renderHook(() => useTimeouts());
    const first = result.current;
    rerender();
    expect(result.current).toBe(first);
  });
});
