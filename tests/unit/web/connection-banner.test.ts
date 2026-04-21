// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("fetch", vi.fn());

import { useConnectionStore } from "@/stores/connection-store";

describe("ConnectionBanner", () => {
  afterEach(() => {
    useConnectionStore.setState({ status: "connected", failedSince: null, lastHealthCheck: null });
  });

  it("renders nothing when connected", async () => {
    const { renderBanner } = await setupRender();
    useConnectionStore.setState({ status: "connected" });
    const { container } = renderBanner();
    expect(container.innerHTML).toBe("");
  });

  it("renders amber banner when disconnected", async () => {
    const { renderBanner } = await setupRender();
    useConnectionStore.setState({ status: "disconnected" });
    const { container } = renderBanner();
    expect(container.textContent).toContain("Reconnecting to server");
  });

  it("renders offline banner when offline", async () => {
    const { renderBanner } = await setupRender();
    useConnectionStore.setState({ status: "offline" });
    const { container } = renderBanner();
    expect(container.textContent).toContain("offline");
  });

  it("renders green banner when reconnected", async () => {
    const { renderBanner } = await setupRender();
    useConnectionStore.setState({ status: "reconnected" });
    const { container } = renderBanner();
    expect(container.textContent).toContain("Connected");
  });
});

async function setupRender() {
  const React = await import("react");
  const { render } = await import("@testing-library/react");
  const { ConnectionBanner } = await import("@/components/common/connection-banner");
  return {
    renderBanner: () => render(React.createElement(ConnectionBanner)),
  };
}
