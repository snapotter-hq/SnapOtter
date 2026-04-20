// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

import { useConnectionStore } from "@/stores/connection-store";

function okHealth() {
  return Promise.resolve(new Response(JSON.stringify({ status: "healthy" }), { status: 200 }));
}

function failHealth() {
  return Promise.reject(new TypeError("Failed to fetch"));
}

describe("connection-store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useConnectionStore.setState({
      status: "connected",
      failedSince: null,
      lastHealthCheck: null,
    });
    fetchMock.mockReset();
  });

  afterEach(() => {
    useConnectionStore.getState().stopPolling();
    vi.useRealTimers();
  });

  it("starts in connected state", () => {
    expect(useConnectionStore.getState().status).toBe("connected");
  });

  it("transitions to disconnected on setDisconnected", () => {
    useConnectionStore.getState().setDisconnected();
    const state = useConnectionStore.getState();
    expect(state.status).toBe("disconnected");
    expect(state.failedSince).toBeTypeOf("number");
  });

  it("does not overwrite failedSince on repeated setDisconnected calls", () => {
    useConnectionStore.getState().setDisconnected();
    const first = useConnectionStore.getState().failedSince;
    useConnectionStore.getState().setDisconnected();
    expect(useConnectionStore.getState().failedSince).toBe(first);
  });

  it("transitions to offline on setOffline", () => {
    useConnectionStore.getState().setOffline();
    expect(useConnectionStore.getState().status).toBe("offline");
  });

  it("transitions from offline to disconnected on setOnline", () => {
    useConnectionStore.getState().setOffline();
    useConnectionStore.getState().setOnline();
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("checkHealth transitions disconnected → reconnected on success", async () => {
    fetchMock.mockImplementation(okHealth);
    useConnectionStore.getState().setDisconnected();
    await useConnectionStore.getState().checkHealth();
    expect(useConnectionStore.getState().status).toBe("reconnected");
    expect(useConnectionStore.getState().lastHealthCheck).toBeTypeOf("number");
  });

  it("checkHealth stays disconnected on failure", async () => {
    fetchMock.mockImplementation(failHealth);
    useConnectionStore.getState().setDisconnected();
    await useConnectionStore.getState().checkHealth();
    expect(useConnectionStore.getState().status).toBe("disconnected");
  });

  it("checkHealth is a no-op when already connected", async () => {
    fetchMock.mockImplementation(okHealth);
    await useConnectionStore.getState().checkHealth();
    expect(useConnectionStore.getState().status).toBe("connected");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("checkHealth transitions connected → disconnected on fetch failure", async () => {
    fetchMock.mockImplementation(failHealth);
    expect(useConnectionStore.getState().status).toBe("connected");
    await useConnectionStore.getState().checkHealth();
    expect(useConnectionStore.getState().status).toBe("disconnected");
    expect(useConnectionStore.getState().failedSince).toBeTypeOf("number");
  });

  it("checkHealth transitions offline → reconnected on success", async () => {
    fetchMock.mockImplementation(okHealth);
    useConnectionStore.getState().setOffline();
    expect(useConnectionStore.getState().status).toBe("offline");
    await useConnectionStore.getState().checkHealth();
    expect(useConnectionStore.getState().status).toBe("reconnected");
    expect(useConnectionStore.getState().failedSince).toBeNull();
    expect(useConnectionStore.getState().lastHealthCheck).toBeTypeOf("number");
  });

  it("startPolling is idempotent", () => {
    useConnectionStore.getState().setDisconnected();
    useConnectionStore.getState().startPolling();
    useConnectionStore.getState().startPolling();
    fetchMock.mockImplementation(failHealth);
    vi.advanceTimersByTime(3000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("stopPolling clears the interval", () => {
    useConnectionStore.getState().setDisconnected();
    fetchMock.mockImplementation(failHealth);
    useConnectionStore.getState().startPolling();
    useConnectionStore.getState().stopPolling();
    vi.advanceTimersByTime(6000);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
