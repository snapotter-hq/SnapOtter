// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
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
    it("sets authenticated state and finishes loading when session succeeds but localStorage property access throws", async () => {
      fetchMock
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ authEnabled: true }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ user: { id: "1" }, session: {} }),
        });

      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { renderHook } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      expect(result.current.loading).toBe(false);
      expect(result.current.authEnabled).toBe(true);
      expect(result.current.isAuthenticated).toBe(true);
    });

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
    it("detectLocale falls back to default locale and I18nProvider renders when window.localStorage property access throws", async () => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

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

      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      vi.stubGlobal("localStorage", throwingStorage);

      const { renderHook, act } = await import("@testing-library/react");
      const { I18nProvider, useTranslation } = await import("@/contexts/i18n-context");

      const { result, unmount } = renderHook(() => useTranslation(), {
        wrapper: I18nProvider,
      });

      expect(result.current.locale).toBe("en");
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to read locale preference from browser storage.",
        expect.any(DOMException),
      );

      warnSpy.mockClear();
      // Changing locale must not crash even when setItem throws
      await act(async () => {
        result.current.setLocale("es");
      });

      expect(result.current.locale).toBe("es");
      expect(warnSpy).toHaveBeenCalledWith(
        "Failed to persist locale preference to browser storage.",
        expect.any(DOMException),
      );
      unmount();
    });
  });

  describe("api storage helpers with blocked storage", () => {
    it("handles window.localStorage property access itself throwing SecurityError", async () => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { formatHeaders } = await import("@/lib/api");

      expect(() => formatHeaders()).not.toThrow();
    });
  });

  describe("AvatarDropdown with blocked storage (#3937)", () => {
    it("renders without throwing while loading and falls back to admin once settled when window.localStorage getter throws SecurityError", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/config/auth")) {
          return { ok: true, status: 200, json: async () => ({ authEnabled: false }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { AvatarDropdown } = await import("@/components/layout/avatar-dropdown");

      expect(() =>
        render(createElement(AvatarDropdown, { onSettingsClick: () => {} })),
      ).not.toThrow();

      const button = screen.getByTestId("user-menu");
      expect(button).toHaveAttribute("aria-label", "");

      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "admin");
      });
    });

    it("falls back to admin when session fails and localStorage.getItem throws SecurityError", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/config/auth")) {
          return { ok: true, status: 200, json: async () => ({ authEnabled: true }) };
        }
        if (url.includes("/api/auth/session")) {
          return { ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) };
        }
        return { ok: false, status: 404, json: async () => ({}) };
      });

      vi.stubGlobal("localStorage", {
        getItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      });

      const { AvatarDropdown } = await import("@/components/layout/avatar-dropdown");

      expect(() =>
        render(createElement(AvatarDropdown, { onSettingsClick: () => {} })),
      ).not.toThrow();

      const button = screen.getByTestId("user-menu");
      await waitFor(() => {
        expect(button).toHaveAttribute("aria-label", "admin");
      });
    });
  });

  describe("SettingsDialog with blocked storage (#3937)", () => {
    it("renders fallback username without unhandled rejection when /api/auth/session rejects and window.localStorage getter throws SecurityError", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/config/auth")) {
          return { ok: true, status: 200, json: async () => ({ authEnabled: true }) };
        }
        if (url.includes("/api/auth/session")) {
          return { ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) };
        }
        if (url.includes("/api/v1/preferences")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ preferences: { defaultToolView: "fullscreen" } }),
          };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { SettingsDialog } = await import("@/components/settings/settings-dialog");

      render(createElement(SettingsDialog, { open: true, onClose: () => {} }));

      await waitFor(() => {
        expect(screen.getByText("admin")).toBeInTheDocument();
      });
    });

    it("renders fallback username without unhandled rejection when /api/auth/session rejects and localStorage.getItem throws SecurityError", async () => {
      fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/api/v1/config/auth")) {
          return { ok: true, status: 200, json: async () => ({ authEnabled: true }) };
        }
        if (url.includes("/api/auth/session")) {
          return { ok: false, status: 401, json: async () => ({ error: "Unauthorized" }) };
        }
        if (url.includes("/api/v1/preferences")) {
          return { ok: true, status: 200, json: async () => ({ preferences: {} }) };
        }
        return { ok: true, status: 200, json: async () => ({}) };
      });

      vi.stubGlobal("localStorage", {
        getItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      });

      const { SettingsDialog } = await import("@/components/settings/settings-dialog");

      render(createElement(SettingsDialog, { open: true, onClose: () => {} }));

      await waitFor(() => {
        expect(screen.getByText("admin")).toBeInTheDocument();
      });
    });
  });

  describe("useThemeStore with blocked or full storage (#3937)", () => {
    it("updates theme and resolvedTheme in memory when window.localStorage getter throws SecurityError", async () => {
      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { useThemeStore } = await import("@/stores/theme-store");

      expect(() => useThemeStore.getState().applyServerDefault("dark")).not.toThrow();
      expect(useThemeStore.getState().theme).toBe("dark");
      expect(useThemeStore.getState().resolvedTheme).toBe("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);

      expect(() => useThemeStore.getState().setTheme("light")).not.toThrow();
      expect(useThemeStore.getState().theme).toBe("light");
      expect(useThemeStore.getState().resolvedTheme).toBe("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);

      // Once the user explicitly picks a theme, applyServerDefault must not overwrite it
      expect(() => useThemeStore.getState().applyServerDefault("dark")).not.toThrow();
      expect(useThemeStore.getState().theme).toBe("light");
      expect(useThemeStore.getState().resolvedTheme).toBe("light");
    });

    it("updates theme and resolvedTheme in memory when localStorage.getItem, setItem, or removeItem throws QuotaExceededError or SecurityError", async () => {
      const throwingStorage = {
        getItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        setItem: vi.fn(() => {
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }),
        removeItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      };
      vi.stubGlobal("localStorage", throwingStorage);

      const { useThemeStore } = await import("@/stores/theme-store");

      expect(() => useThemeStore.getState().applyServerDefault("dark")).not.toThrow();
      expect(useThemeStore.getState().theme).toBe("dark");
      expect(useThemeStore.getState().resolvedTheme).toBe("dark");

      expect(() => useThemeStore.getState().setTheme("light")).not.toThrow();
      expect(useThemeStore.getState().theme).toBe("light");
      expect(useThemeStore.getState().resolvedTheme).toBe("light");

      expect(() => useThemeStore.getState().applyServerDefault("dark")).not.toThrow();
      expect(useThemeStore.getState().theme).toBe("light");
      expect(useThemeStore.getState().resolvedTheme).toBe("light");

      expect(() => useThemeStore.persist.clearStorage()).not.toThrow();
    });

    it("applies server default theme via useSettingsStore.fetch without marking loadError when storage is blocked", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          settings: {
            disabledTools: "[]",
            enableExperimentalTools: "false",
            defaultToolView: "sidebar",
            defaultTheme: "dark",
          },
        }),
      });

      Object.defineProperty(window, "localStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { useSettingsStore } = await import("@/stores/settings-store");
      const { useThemeStore } = await import("@/stores/theme-store");

      await useSettingsStore.getState().fetch();

      expect(useSettingsStore.getState().loaded).toBe(true);
      expect(useSettingsStore.getState().loadError).toBe(false);
      expect(useThemeStore.getState().theme).toBe("dark");
      expect(useThemeStore.getState().resolvedTheme).toBe("dark");
    });
  });

  describe("usePipelineStore with blocked or full storage (#3941)", () => {
    it("updates pipeline state in memory when window.sessionStorage getter throws SecurityError", async () => {
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { usePipelineStore } = await import("@/stores/pipeline-store");

      expect(() => usePipelineStore.getState().addStep("resize")).not.toThrow();
      expect(() => usePipelineStore.getState().addStep("compress")).not.toThrow();
      const steps = usePipelineStore.getState().steps;
      expect(steps).toHaveLength(2);
      expect(usePipelineStore.getState().expandedStepId).toBe(steps[1].id);

      expect(() =>
        usePipelineStore.getState().updateStepSettings(steps[0].id, { width: 800 }),
      ).not.toThrow();
      expect(usePipelineStore.getState().steps[0].settings).toEqual({ width: 800 });

      expect(() =>
        usePipelineStore.getState().reorderSteps(steps[0].id, steps[1].id),
      ).not.toThrow();
      expect(usePipelineStore.getState().steps.map((s) => s.toolId)).toEqual([
        "compress",
        "resize",
      ]);

      expect(() => usePipelineStore.getState().setExpandedStep(null)).not.toThrow();
      expect(usePipelineStore.getState().expandedStepId).toBeNull();

      expect(() => usePipelineStore.getState().removeStep(steps[0].id)).not.toThrow();
      expect(usePipelineStore.getState().steps).toHaveLength(1);

      expect(() =>
        usePipelineStore
          .getState()
          .loadSteps([{ toolId: "convert", settings: { format: "webp" } }]),
      ).not.toThrow();
      expect(usePipelineStore.getState().steps).toHaveLength(1);
      expect(usePipelineStore.getState().steps[0].toolId).toBe("convert");

      expect(() => usePipelineStore.getState().reset()).not.toThrow();
      expect(usePipelineStore.getState().steps).toEqual([]);

      expect(() => usePipelineStore.persist.clearStorage()).not.toThrow();
    });

    it("updates pipeline state in memory when sessionStorage.getItem, setItem, or removeItem throws QuotaExceededError or SecurityError", async () => {
      const throwingStorage = {
        getItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        setItem: vi.fn(() => {
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }),
        removeItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      };
      vi.stubGlobal("sessionStorage", throwingStorage);

      const { usePipelineStore } = await import("@/stores/pipeline-store");

      expect(() => usePipelineStore.getState().addStep("resize")).not.toThrow();
      expect(() => usePipelineStore.getState().addStep("compress")).not.toThrow();
      const steps = usePipelineStore.getState().steps;
      expect(steps).toHaveLength(2);
      expect(usePipelineStore.getState().expandedStepId).toBe(steps[1].id);

      expect(() =>
        usePipelineStore.getState().updateStepSettings(steps[0].id, { width: 800 }),
      ).not.toThrow();
      expect(usePipelineStore.getState().steps[0].settings).toEqual({ width: 800 });

      expect(() =>
        usePipelineStore.getState().reorderSteps(steps[0].id, steps[1].id),
      ).not.toThrow();
      expect(usePipelineStore.getState().steps.map((s) => s.toolId)).toEqual([
        "compress",
        "resize",
      ]);

      expect(() => usePipelineStore.getState().setExpandedStep(null)).not.toThrow();
      expect(usePipelineStore.getState().expandedStepId).toBeNull();

      expect(() => usePipelineStore.getState().removeStep(steps[0].id)).not.toThrow();
      expect(usePipelineStore.getState().steps).toHaveLength(1);

      expect(() =>
        usePipelineStore
          .getState()
          .loadSteps([{ toolId: "convert", settings: { format: "webp" } }]),
      ).not.toThrow();
      expect(usePipelineStore.getState().steps).toHaveLength(1);
      expect(usePipelineStore.getState().steps[0].toolId).toBe("convert");

      expect(() => usePipelineStore.getState().reset()).not.toThrow();
      expect(usePipelineStore.getState().steps).toEqual([]);

      expect(() => usePipelineStore.persist.clearStorage()).not.toThrow();
    });
  });

  describe("redirectIfUnprefixed with blocked or full storage (#3941)", () => {
    afterEach(() => {
      document.head.innerHTML = "";
    });

    it("redirects unprefixed URLs and leaves prefixed URLs alone when window.sessionStorage getter throws SecurityError", async () => {
      document.head.innerHTML = '<base href="/snapotter/">';
      Object.defineProperty(window, "sessionStorage", {
        get() {
          throw new DOMException("Access is denied", "SecurityError");
        },
        configurable: true,
      });

      const { redirectIfUnprefixed } = await import("@/lib/app-url");

      const prefixed = { pathname: "/snapotter/files", search: "", hash: "", replace: vi.fn() };
      expect(redirectIfUnprefixed(prefixed)).toBe(false);
      expect(prefixed.replace).not.toHaveBeenCalled();

      const unprefixed = { pathname: "/files", search: "?job=x", hash: "#top", replace: vi.fn() };
      expect(redirectIfUnprefixed(unprefixed, undefined, 1_000_000)).toBe(true);
      expect(unprefixed.replace).toHaveBeenCalledExactlyOnceWith("/snapotter/files?job=x#top");
    });

    it("redirects unprefixed URLs and leaves prefixed URLs alone when sessionStorage.getItem, setItem, or removeItem throws QuotaExceededError or SecurityError", async () => {
      document.head.innerHTML = '<base href="/snapotter/">';
      const throwingStorage = {
        getItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        setItem: vi.fn(() => {
          throw new DOMException("QuotaExceededError", "QuotaExceededError");
        }),
        removeItem: vi.fn(() => {
          throw new DOMException("Access is denied", "SecurityError");
        }),
        clear: vi.fn(),
        key: vi.fn(() => null),
        length: 0,
      };
      vi.stubGlobal("sessionStorage", throwingStorage);

      const { redirectIfUnprefixed } = await import("@/lib/app-url");

      const prefixed = { pathname: "/snapotter/files", search: "", hash: "", replace: vi.fn() };
      expect(redirectIfUnprefixed(prefixed)).toBe(false);
      expect(prefixed.replace).not.toHaveBeenCalled();
      expect(throwingStorage.removeItem).toHaveBeenCalledWith("snapotter-prefix-redirect");

      const unprefixed = { pathname: "/files", search: "?job=x", hash: "#top", replace: vi.fn() };
      expect(redirectIfUnprefixed(unprefixed, undefined, 1_000_000)).toBe(true);
      expect(unprefixed.replace).toHaveBeenCalledExactlyOnceWith("/snapotter/files?job=x#top");
      expect(throwingStorage.getItem).toHaveBeenCalledWith("snapotter-prefix-redirect");
      expect(throwingStorage.setItem).toHaveBeenCalledWith("snapotter-prefix-redirect", "1000000");
    });
  });
});
