// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = {
  processFiles: vi.fn(),
  processAllFiles: vi.fn(),
  processing: false,
  error: null,
  progress: { phase: "idle", stage: null, percent: 0, elapsed: 0 },
};

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => processor,
}));

import { CompressPdfSettings } from "@/components/tools/compress-pdf-settings";
import { useFileStore } from "@/stores/file-store";

type Entry = {
  status: "pending" | "completed";
  processedSize: number | null;
  resultNotes: { targetKb?: number; targetMet?: boolean } | null;
};

const pdf = (name: string) => new File([new Uint8Array(10)], name, { type: "application/pdf" });

function stage(entries: Entry[], selected = 0) {
  useFileStore.setState({
    files: entries.map((_, i) => pdf(`f${i}.pdf`)),
    entries,
    currentEntry: entries[selected],
  } as never);
}

beforeEach(() => {
  stage([{ status: "pending", processedSize: null, resultNotes: null }]);
});

afterEach(cleanup);

describe("compress-pdf target labels use the server's decimal KB (#1272)", () => {
  it("never shows a missed target next to a smaller achieved size", () => {
    stage([
      {
        status: "completed",
        processedSize: 100_400,
        resultNotes: { targetKb: 100, targetMet: false },
      },
    ]);

    render(<CompressPdfSettings />);

    // 100,400 bytes is over 100 KB (100,000 bytes). With 1024-byte KB this read
    // "Couldn't reach 100 KB. Smallest achievable was 98 KB".
    expect(screen.getByText(/100\.4 KB/)).toBeTruthy();
    expect(screen.queryByText(/\b98 KB\b/)).toBeNull();
  });
});

// #1292: the verdict is the selected file's own, and a batch sums up its misses.
describe("compress-pdf verdict per file (#1292)", () => {
  it("says nothing for a file that hasn't been processed", () => {
    // Notes left over from an earlier run on a file that's pending again.
    stage([
      { status: "pending", processedSize: null, resultNotes: { targetKb: 100, targetMet: false } },
    ]);
    render(<CompressPdfSettings />);
    expect(screen.queryByText(/Couldn't reach|Reached your/)).toBeNull();
  });

  it("sums up a batch's misses", () => {
    stage(
      [
        {
          status: "completed",
          processedSize: 90_000,
          resultNotes: { targetKb: 100, targetMet: true },
        },
        {
          status: "completed",
          processedSize: 184_000,
          resultNotes: { targetKb: 100, targetMet: false },
        },
      ],
      0,
    );
    render(<CompressPdfSettings />);

    expect(screen.getByText("1 of 2 files didn't get under 100 KB.")).toBeTruthy();
    expect(screen.getByText(/Reached your 100 KB target/)).toBeTruthy();
  });
});
