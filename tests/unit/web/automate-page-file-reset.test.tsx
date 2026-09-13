// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { AutomatePage } from "@/pages/automate-page";
import { useFileStore } from "@/stores/file-store";

/**
 * #1122: a tool page hands /automate a run that is already over.
 * use-tool-processor aborts its request and closes its stream on unmount but
 * never clears the file store's processing flag, and nothing on this page owns
 * that flag afterwards. useWorkInFlight counts /automate as owning the file
 * store, so the leftovers had the navigation guard asking about finished work
 * on every navigation away, and raising beforeunload on every tab close, for as
 * long as the tab stayed open.
 *
 * tool-page has cleared the store on arrival since long before the guard
 * existed; this page never did.
 */

// This jsdom setup has no working localStorage; same Map-backed stub as
// avatar-dropdown-session-username.test.tsx.
const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

function png(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

/** Land on /automate, optionally the way the file library navigates here. */
function arrive(state?: { libraryFileIds: string[] }): void {
  render(
    <MemoryRouter initialEntries={[{ pathname: "/automate", state: state ?? null }]}>
      <AutomatePage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/pipeline/list")) {
        return Promise.resolve(new Response(JSON.stringify({ pipelines: [] })));
      }
      return Promise.resolve(
        new Response("file-bytes", {
          headers: { "content-disposition": 'attachment; filename="from-library.png"' },
        }),
      );
    }),
  );
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  // Before the globals go: reset revokes blob urls through the stubbed URL.
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
});

describe("the automate page arrives with a clean file store", () => {
  // The flag the guard reads. Nothing on this page would ever clear it.
  it("clears a processing flag left behind by a tool page", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    useFileStore.getState().setProcessing(true);

    arrive();

    expect(useFileStore.getState().processing).toBe(false);
  });

  it("clears an untaken result left behind by a tool page", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    useFileStore
      .getState()
      .updateEntry(0, { processedUrl: "blob:result", processedFilename: "a-small.png" });

    arrive();

    expect(useFileStore.getState().entries).toEqual([]);
  });

  // The one arrival that carries its own files. Wiping on the way in would be
  // a race against the import, which lands them a tick later.
  it("still imports the files the library sent it", async () => {
    arrive({ libraryFileIds: ["file-1"] });

    await waitFor(() => expect(useFileStore.getState().entries).toHaveLength(1));
    expect(useFileStore.getState().entries[0].file.name).toBe("from-library.png");
  });
});
