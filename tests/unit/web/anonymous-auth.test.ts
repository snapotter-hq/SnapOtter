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
  clearToken: vi.fn(),
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
        // A real "not signed in": 401 is what the server sends for an absent or
        // expired session, and it is the only kind of failure that signs out.
        ok: false,
        status: 401,
        json: async () => ({ error: "Not authenticated" }),
      });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());

    await act(async () => {});

    expect(result.current.loading).toBe(false);
    expect(result.current.authEnabled).toBe(true);
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

describe("useAuth when /api/v1/config/auth fails (#2297)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
  });

  it.each([
    [429, { error: "Rate limit exceeded, retry in 1 minute" }],
    [500, { error: "Internal server error" }],
    [503, { error: "Service unavailable" }],
  ])("does not treat a %i response as 'auth disabled'", async (status, body) => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => body });

    const { renderHook, act } = await import("@testing-library/react");
    const { useAuth } = await import("@/hooks/use-auth");

    const { result } = renderHook(() => useAuth());
    await act(async () => {});

    // The same outcome as an unreachable server: keep loading, never anonymous admin.
    expect(result.current.loading).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.role).toBeNull();
    vi.useRealTimers();
  });

  it("treats a 200 whose body is not an auth config as a failure too", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ oops: true }),
      });

      const { renderHook, act } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      const { result } = renderHook(() => useAuth());
      await act(async () => {});

      expect(result.current.loading).toBe(true);
      expect(result.current.role).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps growing the delay when the failure is the session check, not the config", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fetchMock.mockImplementation(async (url: string) => {
        if (url.endsWith("/api/v1/config/auth")) {
          return { ok: true, status: 200, json: async () => ({ authEnabled: true }) };
        }
        throw new TypeError("network error on the session call");
      });

      const { renderHook, act } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      renderHook(() => useAuth());
      await act(async () => {});
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });

      const sessionCalls = fetchMock.mock.calls.filter(([url]) =>
        String(url).endsWith("/api/auth/session"),
      );
      // Attempts at 0, 1, 3, 7, 15 and 31 seconds, not one a second.
      expect(sessionCalls).toHaveLength(6);
    } finally {
      vi.useRealTimers();
    }
  });

  it("retries on its own, with a growing delay, and recovers the same consumer", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({}) })
        .mockResolvedValueOnce({ ok: false, status: 500, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ authEnabled: false }),
        });

      const { renderHook, act } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      const { result } = renderHook(() => useAuth());
      await act(async () => {});
      expect(result.current.loading).toBe(true);
      expect(fetchMock).toHaveBeenCalledTimes(1);

      // First retry after 1s, second after 2s.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(result.current.loading).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(2_000);
      });
      expect(fetchMock).toHaveBeenCalledTimes(3);
      expect(result.current.loading).toBe(false);
      expect(result.current.authEnabled).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });

  it("logs the failure instead of swallowing it, and stops retrying when unmounted", async () => {
    vi.useFakeTimers();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

      const { renderHook, act } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      const { unmount } = renderHook(() => useAuth());
      await act(async () => {});
      expect(warn).toHaveBeenCalledWith(
        expect.stringMatching(/Auth check failed/),
        expect.any(Error),
      );

      unmount();
      const calls = fetchMock.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120_000);
      });
      expect(fetchMock.mock.calls.length).toBe(calls);
    } finally {
      vi.useRealTimers();
    }
  });

  it("caps the retry delay", async () => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });

      const { renderHook, act } = await import("@testing-library/react");
      const { useAuth } = await import("@/hooks/use-auth");

      renderHook(() => useAuth());
      await act(async () => {});
      // 1 + 2 + 4 + 8 + 16 s of waiting reaches the 30s cap on the next attempt.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(31_000);
      });
      const before = fetchMock.mock.calls.length;
      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });

      expect(fetchMock.mock.calls.length - before).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("useAuth when the session check fails (#2355)", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.resetModules();
  });

  async function renderWithSession(status: number, body: unknown = {}) {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ authEnabled: true }) })
      .mockResolvedValueOnce({ ok: false, status, json: async () => body });

    const { renderHook, act } = await import("@testing-library/react");
    const { clearToken } = await import("@/lib/api");
    const { useAuth } = await import("@/hooks/use-auth");
    vi.mocked(clearToken).mockClear();

    const { result } = renderHook(() => useAuth());
    await act(async () => {});
    return { result, clearToken: vi.mocked(clearToken) };
  }

  it.each([[429], [500], [503]])(
    "keeps the session and retries on a %i instead of signing the user out",
    async (status) => {
      vi.useFakeTimers();
      vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        const { result, clearToken } = await renderWithSession(status);

        expect(clearToken).not.toHaveBeenCalled();
        expect(result.current.loading).toBe(true);
        expect(result.current.isAuthenticated).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    },
  );

  it.each([
    [401, "not signed in"],
    [403, "the account is disabled"],
  ])("signs the user out on a %i, which is what %s means", async (status) => {
    const { result, clearToken } = await renderWithSession(status);

    expect(clearToken).toHaveBeenCalled();
    expect(result.current.loading).toBe(false);
    expect(result.current.authEnabled).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });
});
