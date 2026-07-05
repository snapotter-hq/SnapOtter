// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

// fetch + localStorage must be stubbed before the modules under test load.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

const storageMap = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storageMap.get(k) ?? null,
  setItem: (k: string, v: string) => storageMap.set(k, v),
  removeItem: (k: string) => storageMap.delete(k),
  clear: () => storageMap.clear(),
  get length() {
    return storageMap.size;
  },
  key: () => null,
});

import { flushPinnedWrites, usePinnedToolsStore } from "@/stores/pinned-tools-store";

function okJson(data: unknown) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(data),
  } as unknown as Response);
}

function failResponse(status: number) {
  return Promise.resolve({
    ok: false,
    status,
    json: () => Promise.reject(new Error("no body")),
  } as unknown as Response);
}

describe("pinned-tools store", () => {
  beforeEach(async () => {
    // Drain any write queued by a prior test before swapping the fetch mock,
    // so a leaked PUT cannot run against the next test's fresh mock.
    await flushPinnedWrites();
    fetchMock.mockReset();
    usePinnedToolsStore.setState({
      pinnedTools: [],
      lastConfirmed: [],
      loaded: false,
      loadError: false,
    });
  });

  it("fetch loads pinnedTools from /v1/preferences", async () => {
    fetchMock.mockReturnValueOnce(okJson({ preferences: { pinnedTools: ["resize", "compress"] } }));
    await usePinnedToolsStore.getState().fetch();
    const s = usePinnedToolsStore.getState();
    expect(s.pinnedTools).toEqual(["resize", "compress"]);
    expect(s.lastConfirmed).toEqual(["resize", "compress"]);
    expect(s.loaded).toBe(true);
    expect(s.loadError).toBe(false);
  });

  it("fetch defaults to [] when pinnedTools is missing or malformed", async () => {
    fetchMock.mockReturnValueOnce(okJson({ preferences: { pinnedTools: "not-an-array" } }));
    await usePinnedToolsStore.getState().fetch();
    expect(usePinnedToolsStore.getState().pinnedTools).toEqual([]);
    expect(usePinnedToolsStore.getState().loaded).toBe(true);
  });

  it("fetch sets loadError on network failure", async () => {
    fetchMock.mockReturnValueOnce(failResponse(500));
    await usePinnedToolsStore.getState().fetch();
    expect(usePinnedToolsStore.getState().loaded).toBe(true);
    expect(usePinnedToolsStore.getState().loadError).toBe(true);
  });

  it("pin prepends and updates state synchronously", () => {
    usePinnedToolsStore.setState({ pinnedTools: ["compress"], lastConfirmed: ["compress"] });
    fetchMock.mockReturnValue(okJson({ ok: true }));
    usePinnedToolsStore.getState().pin("resize");
    expect(usePinnedToolsStore.getState().pinnedTools).toEqual(["resize", "compress"]);
  });

  it("pin is a no-op when the tool is already pinned", () => {
    usePinnedToolsStore.setState({ pinnedTools: ["resize"], lastConfirmed: ["resize"] });
    usePinnedToolsStore.getState().pin("resize");
    expect(usePinnedToolsStore.getState().pinnedTools).toEqual(["resize"]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("unpin removes the tool", () => {
    usePinnedToolsStore.setState({
      pinnedTools: ["resize", "compress"],
      lastConfirmed: ["resize", "compress"],
    });
    fetchMock.mockReturnValue(okJson({ ok: true }));
    usePinnedToolsStore.getState().unpin("resize");
    expect(usePinnedToolsStore.getState().pinnedTools).toEqual(["compress"]);
  });

  it("pin persists the full array via PUT /v1/preferences", async () => {
    usePinnedToolsStore.setState({ pinnedTools: [], lastConfirmed: [] });
    fetchMock.mockReturnValue(okJson({ ok: true }));
    usePinnedToolsStore.getState().pin("resize");
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/preferences");
    expect(opts.method).toBe("PUT");
    expect(JSON.parse(opts.body)).toEqual({ pinnedTools: ["resize"] });
    await vi.waitFor(() =>
      expect(usePinnedToolsStore.getState().lastConfirmed).toEqual(["resize"]),
    );
  });

  it("rolls back to lastConfirmed when the PUT fails", async () => {
    usePinnedToolsStore.setState({ pinnedTools: ["compress"], lastConfirmed: ["compress"] });
    fetchMock.mockReturnValueOnce(failResponse(500));
    usePinnedToolsStore.getState().pin("resize");
    // Optimistic update applied immediately.
    expect(usePinnedToolsStore.getState().pinnedTools).toEqual(["resize", "compress"]);
    // Rolls back once the failed write settles.
    await vi.waitFor(() =>
      expect(usePinnedToolsStore.getState().pinnedTools).toEqual(["compress"]),
    );
  });

  it("isPinned reflects current state", () => {
    usePinnedToolsStore.setState({ pinnedTools: ["resize"], lastConfirmed: ["resize"] });
    expect(usePinnedToolsStore.getState().isPinned("resize")).toBe(true);
    expect(usePinnedToolsStore.getState().isPinned("compress")).toBe(false);
  });
});
