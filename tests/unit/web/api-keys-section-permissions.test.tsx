// @vitest-environment jsdom

/**
 * Regression coverage for Sentry WEB-C: an API key row whose `permissions`
 * came back as a non-array (a 1.x import can leave a jsonb string in the
 * column) crashed the whole settings dialog through the ErrorBoundary with
 * `t.permissions.join is not a function`. The list must render the key and
 * just skip the scoped line.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiKeysSection } from "@/components/settings/settings-dialog";

const apiGet = vi.hoisted(() => vi.fn());

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    permissions: [],
    hasPermission: () => true,
    authEnabled: true,
    role: "admin",
  }),
}));

function key(overrides: Record<string, unknown>) {
  return {
    id: 1,
    name: "legacy key",
    prefix: "si_abc",
    createdAt: "2026-01-01T00:00:00Z",
    permissions: null,
    expiresAt: null,
    ...overrides,
  };
}

afterEach(() => {
  cleanup();
  apiGet.mockReset();
});

describe("ApiKeysSection permissions rendering", () => {
  it("renders a key whose permissions is a jsonb string instead of crashing", async () => {
    apiGet.mockResolvedValue({ apiKeys: [key({ permissions: "images:process,files:read" })] });

    render(<ApiKeysSection />);

    expect(await screen.findByText("legacy key")).toBeTruthy();
    // The malformed value must not be presented as a scoped list.
    expect(screen.queryByText(/Scoped:/)).toBeNull();
  });

  it("still renders the scoped list for a well-formed permissions array", async () => {
    apiGet.mockResolvedValue({
      apiKeys: [key({ id: 2, name: "scoped key", permissions: ["images:process"] })],
    });

    render(<ApiKeysSection />);

    expect(await screen.findByText("scoped key")).toBeTruthy();
    expect(await screen.findByText(/Scoped: images:process/)).toBeTruthy();
  });
});
