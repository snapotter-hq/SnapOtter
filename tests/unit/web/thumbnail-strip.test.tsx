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
});
