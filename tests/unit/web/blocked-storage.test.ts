// @vitest-environment jsdom

import { act, cleanup } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/stores/connection-store", () => ({
  useConnectionStore: {
    subscribe: () => () => {},
    getState: () => ({ setDisconnected: vi.fn() }),
  },
}));

vi.mock("@/lib/analytics", () => ({
  setSentryTag: vi.fn(),
  getDistinctId: () => "",
}));

describe("blocked browser storage resilience (#2318)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe("useAuth with blocked storage", () => {
    it("sets unauthenticated state and finishes loading when session fails and localStorage.removeItem throws", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ authEnabled: true }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({ error: "Unauthorized" }),
        });

      const throwingStorage = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        removeItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        clear: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        key: vi.fn(() => null),
        get length() {
          return 0;
        },
      };

      vi.stubGlobal("localStorage", throwingStorage);

      const { renderHook } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      // Loading spinner must not be left hanging
      expect(result.current.loading).toBe(false);
      expect(result.current.authEnabled).toBe(true);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.role).toBeNull();
    });

    it("clears loading state even when clearToken throws directly", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ authEnabled: true }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 401,
          json: async () => ({}),
        });

      const api = await import("@/lib/api");
      vi.spyOn(api, "clearToken").mockImplementation(() => {
        throw new Error("QuotaExceeded or SecurityError in clearToken");
      });

      const { renderHook } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      expect(result.current.loading).toBe(false);
      expect(result.current.isAuthenticated).toBe(false);
      expect(result.current.role).toBeNull();
    });
  });

  describe("i18n-context with blocked storage", () => {
    it("detectLocale falls back to default locale and I18nProvider renders without throwing", async () => {
      const throwingStorage = {
        getItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        setItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        removeItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        clear: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        key: vi.fn(() => null),
        get length() {
          return 0;
        },
      };

      vi.stubGlobal("localStorage", throwingStorage);

      const { renderHook, act } = await import("@testing-library/react");
      const { I18nProvider, useTranslation } = await import("@/contexts/i18n-context");

      const { result, unmount } = renderHook(() => useTranslation(), {
        wrapper: I18nProvider,
      });

      expect(result.current.locale).toBe("en");

      // Changing locale must not crash even when setItem throws
      await act(async () => {
        result.current.setLocale("es");
      });

      expect(result.current.locale).toBe("es");
      unmount();
    });
  });

  describe("api storage helpers with blocked storage", () => {
    it("getToken, setToken, clearToken and formatHeaders do not throw when localStorage methods throw", async () => {
      const throwingStorage = {
        getItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        setItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        removeItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        clear: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        key: vi.fn(() => null),
        get length() {
          return 0;
        },
      };

      vi.stubGlobal("localStorage", throwingStorage);

      const { clearToken, setToken, formatHeaders } = await import("@/lib/api");

      expect(() => setToken("test-token")).not.toThrow();
      expect(() => clearToken()).not.toThrow();
      expect(() => formatHeaders()).not.toThrow();
    });

    it("handles window.localStorage property access itself throwing SecurityError", async () => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { clearToken, setToken, formatHeaders } = await import("@/lib/api");

      expect(() => setToken("test-token")).not.toThrow();
      expect(() => clearToken()).not.toThrow();
      expect(() => formatHeaders()).not.toThrow();
    });
  });
});
