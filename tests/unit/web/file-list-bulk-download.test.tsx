// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
// By path: a bare "sonner" resolves differently here than in apps/web and mocks nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner/dist/index.mjs", () => ({
  toast: { error: toastError },
}));

import { FileList } from "@/components/files/file-list";
import type { UserFile } from "@/lib/api";
import { useFilesPageStore } from "@/stores/files-page-store";

// #4505: WebKit keeps only the last of several <a download> clicks made in one
// task, so ticking three files and pressing Download saved one. A selection of
// two or more now goes out as a single ZIP, which is a single click.

function userFile(id: string, originalName: string): UserFile {
  return {
    id,
    originalName,
    mimeType: "image/png",
    size: 1024,
    width: 10,
    height: 10,
    version: 1,
    toolChain: [],
    createdAt: "2026-11-19T00:00:00.000Z",
  };
}

const files = [userFile("a", "one.png"), userFile("b", "two.png"), userFile("c", "three.png")];
const initialState = useFilesPageStore.getInitialState();

let clicks: Array<{ href: string; download: string }>;
let fetchMock: ReturnType<typeof vi.fn>;

function seed(checked: string[]) {
  useFilesPageStore.setState(
    {
      ...initialState,
      files,
      total: files.length,
      checkedIds: new Set(checked),
      fetchFiles: vi.fn(async () => {}),
    },
    true,
  );
}

function downloadButton() {
  return screen.getByRole("button", { name: "Download" });
}

beforeEach(() => {
  clicks = [];
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicks.push({ href: this.href, download: this.download });
  });
  Object.assign(URL, {
    createObjectURL: vi.fn(() => "blob:zip"),
    revokeObjectURL: vi.fn(),
  });
  fetchMock = vi.fn(
    async () =>
      new Response(new Blob(["PK"]), {
        status: 200,
        headers: { "Content-Type": "application/zip" },
      }),
  );
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  cleanup();
  useFilesPageStore.setState({ ...initialState, checkedIds: new Set() }, true);
  toastError.mockReset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("FileList bulk download", () => {
  it("downloads several checked files with one click on one ZIP", async () => {
    seed(["a", "b", "c"]);
    render(<FileList />);

    fireEvent.click(downloadButton());

    await waitFor(() => expect(clicks).toHaveLength(1));
    expect(clicks[0]).toEqual({ href: "blob:zip", download: "files.zip" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/api\/v1\/files\/download$/);
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ ids: ["a", "b", "c"] });
    expect(toastError).not.toHaveBeenCalled();
  });

  it("keeps the direct link for a single checked file", () => {
    seed(["b"]);
    render(<FileList />);

    fireEvent.click(downloadButton());

    expect(clicks).toHaveLength(1);
    expect(clicks[0].href).toMatch(/\/api\/v1\/files\/b\/download$/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("disables the button while the ZIP is on its way", async () => {
    let answer: (res: Response) => void = () => {};
    fetchMock.mockImplementation(() => new Promise<Response>((resolve) => (answer = resolve)));
    seed(["a", "b"]);
    render(<FileList />);

    fireEvent.click(downloadButton());
    await waitFor(() => expect(downloadButton()).toBeDisabled());

    answer(new Response(new Blob(["PK"]), { status: 200 }));
    await waitFor(() => expect(downloadButton()).toBeEnabled());
    expect(clicks).toHaveLength(1);
  });

  it("says so, and saves nothing, when the server refuses the selection", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ error: "File not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      }),
    );
    seed(["a", "b"]);
    render(<FileList />);

    fireEvent.click(downloadButton());

    await waitFor(() => expect(toastError).toHaveBeenCalledTimes(1));
    expect(clicks).toHaveLength(0);
    await waitFor(() => expect(downloadButton()).toBeEnabled());
  });

  it("shows the bulk-download message when the archive stream breaks", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      blob: () => Promise.reject(new TypeError("Load failed")),
    } as unknown as Response);
    seed(["a", "b"]);
    render(<FileList />);

    fireEvent.click(downloadButton());

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Couldn't download the selected files."),
    );
    expect(clicks).toHaveLength(0);
  });
});
