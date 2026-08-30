// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AvatarDropdown } from "@/components/layout/avatar-dropdown";

/**
 * Separate file from avatar-dropdown-session-username.test.tsx on purpose:
 * use-auth.ts caches the /api/v1/config/auth response at module level, so a
 * test needing authEnabled:false can't share a module registry with tests
 * that cached authEnabled:true.
 */

const storageMap = vi.hoisted(() => new Map<string, string>());
const localStorageMock = vi.hoisted(() => ({
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  key: vi.fn((_index: number) => null),
  get length() {
    return storageMap.size;
  },
}));

beforeEach(() => {
  vi.stubGlobal("localStorage", localStorageMock);
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("AvatarDropdown with auth disabled", () => {
  it("settles on the admin label without ever calling the session endpoint", async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/config/auth")) {
        return { ok: true, status: 200, json: async () => ({ authEnabled: false }) };
      }
      // In strict no-auth deployments the session route may not even exist;
      // reaching it from the anon branch would be a regression.
      throw new Error(`unexpected fetch in no-auth mode: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<AvatarDropdown onSettingsClick={() => {}} />);

    const button = screen.getByTestId("user-menu");
    await waitFor(() => expect(button).toHaveAttribute("aria-label", "admin"));

    const urls = fetchMock.mock.calls.map((call) => String(call[0]));
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((url) => url.includes("/api/v1/config/auth"))).toBe(true);
  });
});
