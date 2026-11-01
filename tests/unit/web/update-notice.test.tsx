// @vitest-environment jsdom

import { APP_VERSION } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ loading: false, permissions: ["settings:write"] as string[] }));
const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    loading: auth.loading,
    hasPermission: (p: string) => auth.permissions.includes(p),
  }),
}));
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet,
}));

import { UpdateNotice } from "@/components/layout/update-notice";
import { resetUpdateNoticeRequest } from "@/lib/update-notice";

function bump(version: string): string {
  const [major, minor] = version.split(".").map(Number);
  return `${major}.${minor + 1}.0`;
}

const NEWER = bump(APP_VERSION);
const RELEASE = {
  version: NEWER,
  url: `https://github.com/snapotter-hq/SnapOtter/releases/tag/v${NEWER}`,
};
const DISMISSED_KEY = "snapotter.updateNotice.dismissedVersion";

// Node 25 ships its own localStorage global, which shadows jsdom's.
function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key) => store.get(key) ?? null,
    key: (index) => [...store.keys()][index] ?? null,
    removeItem: (key) => {
      store.delete(key);
    },
    setItem: (key, value) => {
      store.set(key, String(value));
    },
  };
}

beforeEach(() => {
  auth.loading = false;
  auth.permissions = ["settings:write"];
  apiGet.mockReset();
  apiGet.mockResolvedValue({ latest: RELEASE });
  resetUpdateNoticeRequest();
  vi.stubGlobal("localStorage", memoryStorage());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("UpdateNotice", () => {
  it("tells an admin about a newer release and links to it", async () => {
    render(<UpdateNotice />);
    expect(
      await screen.findByText(`SnapOtter ${NEWER} is available. You're on ${APP_VERSION}.`, {
        exact: false,
      }),
    ).toBeDefined();
    const link = screen.getByRole("link", { name: "What's new" });
    expect(link.getAttribute("href")).toBe(RELEASE.url);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(apiGet).toHaveBeenCalledWith("/v1/admin/latest-release");
  });

  it("never asks the API for a user who can't manage settings", async () => {
    auth.permissions = ["tools:use"];
    render(<UpdateNotice />);
    await Promise.resolve();
    expect(apiGet).not.toHaveBeenCalled();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing when the API reports no newer release (analytics off included)", async () => {
    apiGet.mockResolvedValue({ latest: null });
    render(<UpdateNotice />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing for a release that isn't newer than this one", async () => {
    apiGet.mockResolvedValue({ latest: { ...RELEASE, version: APP_VERSION } });
    render(<UpdateNotice />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows nothing when the request fails", async () => {
    apiGet.mockRejectedValue(new Error("offline"));
    render(<UpdateNotice />);
    await waitFor(() => expect(apiGet).toHaveBeenCalled());
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("remembers a dismissal for that version only", async () => {
    const { unmount } = render(<UpdateNotice />);
    fireEvent.click(await screen.findByRole("button", { name: "Dismiss update notice" }));
    expect(screen.queryByRole("status")).toBeNull();
    expect(localStorage.getItem(DISMISSED_KEY)).toBe(NEWER);
    unmount();

    resetUpdateNoticeRequest();
    render(<UpdateNotice />);
    await waitFor(() => expect(apiGet).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("status")).toBeNull();
    cleanup();

    const later = bump(NEWER);
    apiGet.mockResolvedValue({
      latest: {
        version: later,
        url: `https://github.com/snapotter-hq/SnapOtter/releases/tag/v${later}`,
      },
    });
    resetUpdateNoticeRequest();
    render(<UpdateNotice />);
    expect(await screen.findByRole("status")).toBeDefined();
  });
});
