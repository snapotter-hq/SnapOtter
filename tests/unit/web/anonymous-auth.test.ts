// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

vi.mock("@/stores/connection-store", () => ({
  useConnectionStore: {
    subscribe: () => () => {},
  },
}));

vi.mock("@/lib/api", () => ({
  formatHeaders: () => new Headers(),
}));

describe("useAuth anonymous happy path", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
  });

  it("sets role to admin when authEnabled is false", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authEnabled: false }),
    });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.authEnabled).toBe(false);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.role).toBe("admin");
  });

  it("includes settings:write in anonymous permissions", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authEnabled: false }),
    });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.hasPermission("settings:write")).toBe(true);
    expect(result.current.hasPermission("settings:read")).toBe(true);
  });

  it("includes all admin permissions in anonymous mode", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authEnabled: false }),
    });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    const expectedPerms = [
      "tools:use",
      "files:own",
      "files:all",
      "apikeys:own",
      "apikeys:all",
      "pipelines:own",
      "pipelines:all",
      "settings:read",
      "settings:write",
      "users:manage",
      "teams:manage",
      "features:manage",
      "system:health",
      "audit:read",
    ];
    for (const perm of expectedPerms) {
      expect(result.current.hasPermission(perm)).toBe(true);
    }
  });

  it("does not call session endpoint when auth is disabled", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authEnabled: false }),
    });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    renderHook(() => useAuth());

    await act(async () => {});

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/config/auth");
  });

  it("does NOT grant admin when authEnabled is true and session fails", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authEnabled: true }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({}),
      });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.role).toBeNull();
    expect(result.current.permissions).toEqual([]);
  });
});

describe("useAuth totpEnabled", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
  });

  it("reflects session.user.totpEnabled when authenticated", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authEnabled: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          user: { role: "admin", permissions: [], totpEnabled: true },
        }),
      });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.totpEnabled).toBe(true);
  });

  it("defaults to false when the session omits totpEnabled", async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authEnabled: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ user: { role: "admin", permissions: [] } }),
      });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.totpEnabled).toBe(false);
  });
});

describe("useAuth hasPermission", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
  });

  it("returns false for permissions not in the list", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ authEnabled: false }),
    });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.hasPermission("nonexistent:permission")).toBe(false);
  });
});
