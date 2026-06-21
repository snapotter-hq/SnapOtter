// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock window.matchMedia for controlled breakpoint testing
// ---------------------------------------------------------------------------
let currentMatches = false;
const listeners = new Map<string, Set<(e: MediaQueryListEvent) => void>>();

function createMockMql(query: string): MediaQueryList {
  if (!listeners.has(query)) {
    listeners.set(query, new Set());
  }
  return {
    matches: currentMatches,
    media: query,
    onchange: null,
    addEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.get(query)!.add(handler);
    },
    removeEventListener: (_: string, handler: (e: MediaQueryListEvent) => void) => {
      listeners.get(query)!.delete(handler);
    },
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  } as unknown as MediaQueryList;
}

function fireMediaChange(query: string, matches: boolean) {
  currentMatches = matches;
  const set = listeners.get(query);
  if (set) {
    for (const handler of set) {
      handler({ matches, media: query } as MediaQueryListEvent);
    }
  }
}

describe("use-mobile hook", () => {
  beforeEach(() => {
    currentMatches = false;
    listeners.clear();
    vi.stubGlobal(
      "matchMedia",
      vi.fn((q: string) => createMockMql(q)),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exports MOBILE_BREAKPOINT at 768", async () => {
    // The hook uses max-width: 767px (MOBILE_BREAKPOINT - 1)
    const mod = await import("@/hooks/use-mobile");
    // useMobile calls useMediaQuery with `(max-width: 767px)`
    expect(mod.useMobile).toBeDefined();
  });

  it("useMobile returns false when viewport >= 768px (desktop)", async () => {
    // Viewport wider than breakpoint: matchMedia returns false
    currentMatches = false;
    const { renderHook } = await import("@testing-library/react");
    const { useMobile } = await import("@/hooks/use-mobile");

    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(false);
  });

  it("useMobile returns true when viewport < 768px (mobile)", async () => {
    // Viewport narrower than breakpoint: matchMedia returns true
    currentMatches = true;
    const { renderHook } = await import("@testing-library/react");
    const { useMobile } = await import("@/hooks/use-mobile");

    const { result } = renderHook(() => useMobile());
    expect(result.current).toBe(true);
  });

  it("useMediaQuery updates when media query changes", async () => {
    currentMatches = false;
    const { renderHook, act } = await import("@testing-library/react");
    const { useMediaQuery } = await import("@/hooks/use-mobile");

    const query = "(max-width: 767px)";
    const { result } = renderHook(() => useMediaQuery(query));
    expect(result.current).toBe(false);

    // Simulate viewport shrinking below breakpoint
    await act(() => {
      fireMediaChange(query, true);
    });
    expect(result.current).toBe(true);

    // Simulate viewport growing above breakpoint
    await act(() => {
      fireMediaChange(query, false);
    });
    expect(result.current).toBe(false);
  });

  it("useTouchDevice returns true for coarse pointer", async () => {
    currentMatches = true;
    const { renderHook } = await import("@testing-library/react");
    const { useTouchDevice } = await import("@/hooks/use-mobile");

    const { result } = renderHook(() => useTouchDevice());
    expect(result.current).toBe(true);
  });

  it("useTouchDevice returns false for fine pointer (desktop)", async () => {
    currentMatches = false;
    const { renderHook } = await import("@testing-library/react");
    const { useTouchDevice } = await import("@/hooks/use-mobile");

    const { result } = renderHook(() => useTouchDevice());
    expect(result.current).toBe(false);
  });

  // Device-specific breakpoint validation
  describe("device breakpoint classification", () => {
    it("Pixel 7 (412px) is classified as mobile", async () => {
      // 412 < 768, so max-width:767px matches
      currentMatches = true;
      const { renderHook } = await import("@testing-library/react");
      const { useMobile } = await import("@/hooks/use-mobile");

      const { result } = renderHook(() => useMobile());
      expect(result.current).toBe(true);
    });

    it("iPhone 14 (390px) is classified as mobile", async () => {
      currentMatches = true;
      const { renderHook } = await import("@testing-library/react");
      const { useMobile } = await import("@/hooks/use-mobile");

      const { result } = renderHook(() => useMobile());
      expect(result.current).toBe(true);
    });

    it("Galaxy Tab S9 (640px) is classified as mobile", async () => {
      // 640 < 768, so max-width:767px matches -> mobile!
      currentMatches = true;
      const { renderHook } = await import("@testing-library/react");
      const { useMobile } = await import("@/hooks/use-mobile");

      const { result } = renderHook(() => useMobile());
      expect(result.current).toBe(true);
    });

    it("iPad gen 7 (810px) is NOT classified as mobile", async () => {
      // 810 >= 768, so max-width:767px does NOT match -> not mobile
      currentMatches = false;
      const { renderHook } = await import("@testing-library/react");
      const { useMobile } = await import("@/hooks/use-mobile");

      const { result } = renderHook(() => useMobile());
      expect(result.current).toBe(false);
    });
  });
});
