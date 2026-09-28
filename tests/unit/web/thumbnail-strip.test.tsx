// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL: vi.fn(() => "blob:fake-url"),
  revokeObjectURL: vi.fn(),
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
}));

// jsdom has no layout engine, so scrollIntoView is undefined.
HTMLElement.prototype.scrollIntoView = vi.fn();

import { ThumbnailStrip } from "@/components/common/thumbnail-strip";
import { type FileEntry, useFileStore } from "@/stores/file-store";

function stage(...fileNames: string[]): FileEntry[] {
  const files = fileNames.map(
    (name) => new File([new ArrayBuffer(64)], name, { type: "image/png" }),
  );
  useFileStore.getState().setFiles(files);
  return useFileStore.getState().entries;
}

describe("ThumbnailStrip", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders nothing with a single file", () => {
    const entries = stage("only.png");
    const { container } = render(
      <ThumbnailStrip entries={entries} selectedIndex={0} onSelect={() => {}} />,
    );
    expect(container.innerHTML).toBe("");
  });

  it("selects a thumbnail on click", () => {
    const entries = stage("a.png", "b.png", "c.png");
    const onSelect = vi.fn();
    render(<ThumbnailStrip entries={entries} selectedIndex={0} onSelect={onSelect} />);

    fireEvent.click(screen.getByRole("button", { name: "c.png" }));

    expect(onSelect).toHaveBeenCalledWith(2);
  });

  it("shows a reverse-order control that calls onReverse", () => {
    const entries = stage("a.png", "b.png");
    const onReverse = vi.fn();
    render(
      <ThumbnailStrip
        entries={entries}
        selectedIndex={0}
        onSelect={() => {}}
        onReverse={onReverse}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /reverse order/i }));

    expect(onReverse).toHaveBeenCalledTimes(1);
  });

  it("omits the reverse control when onReverse is not provided", () => {
    const entries = stage("a.png", "b.png");
    render(<ThumbnailStrip entries={entries} selectedIndex={0} onSelect={() => {}} />);

    expect(screen.queryByRole("button", { name: /reverse order/i })).toBeNull();
  });

  it("renders a drag handle per file when onReorder is provided", () => {
    const entries = stage("a.png", "b.png", "c.png");
    render(
      <ThumbnailStrip
        entries={entries}
        selectedIndex={0}
        onSelect={() => {}}
        onReorder={() => {}}
      />,
    );

    expect(screen.getAllByLabelText(/drag to reorder/i)).toHaveLength(3);
  });

  it("renders no drag handles when onReorder is absent", () => {
    const entries = stage("a.png", "b.png", "c.png");
    render(<ThumbnailStrip entries={entries} selectedIndex={0} onSelect={() => {}} />);

    expect(screen.queryAllByLabelText(/drag to reorder/i)).toHaveLength(0);
  });

  // #1292: after a batch, the files that were scaled down to fit or missed their
  // size target are marked, so you can see which ones without opening each.
  it("marks completed files whose result carries a warning", () => {
    stage("fit.jpg", "shrunk.jpg", "missed.pdf", "plain.jpg", "pending.jpg");
    const store = useFileStore.getState();
    store.updateEntry(0, {
      status: "completed",
      processedUrl: "blob:0",
      resultNotes: { targetKb: 20 },
    });
    store.updateEntry(1, {
      status: "completed",
      processedUrl: "blob:1",
      resultNotes: { targetKb: 20, resizedTo: { width: 800, height: 600 } },
    });
    store.updateEntry(2, {
      status: "completed",
      processedUrl: "blob:2",
      resultNotes: { targetKb: 100, targetMet: false },
    });
    store.updateEntry(3, { status: "completed", processedUrl: "blob:3", resultNotes: null });
    // Stale notes on a file that isn't finished must not mark it.
    store.updateEntry(4, { status: "pending", resultNotes: { targetMet: false } });
    render(
      <ThumbnailStrip
        entries={useFileStore.getState().entries}
        selectedIndex={0}
        onSelect={() => {}}
      />,
    );

    const tile = (name: string) => screen.getByRole("button", { name });
    const badge = (name: string) => tile(name).querySelector("[data-result-warning]");
    expect(badge("fit.jpg")).toBeNull();
    expect(badge("plain.jpg")).toBeNull();
    expect(badge("pending.jpg")).toBeNull();
    expect(badge("shrunk.jpg")?.getAttribute("title")).toBe("Scaled down to fit the size target");
    expect(badge("missed.pdf")?.getAttribute("title")).toBe("Didn't reach the size target");

    // The mark replaces the check rather than sitting next to it.
    expect(tile("shrunk.jpg").querySelector(".bg-green-500")).toBeNull();
    expect(tile("fit.jpg").querySelector(".bg-green-500")).not.toBeNull();

    // Named by the filename (e2e specs select tiles by it), described by the
    // reason so a screen reader hears why it's flagged.
    const describedBy = tile("shrunk.jpg").getAttribute("aria-describedby");
    expect(describedBy && document.getElementById(describedBy)?.textContent).toBe(
      "Scaled down to fit the size target",
    );
    expect(tile("fit.jpg").getAttribute("aria-describedby")).toBeNull();
  });
});
