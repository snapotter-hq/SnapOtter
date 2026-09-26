// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const processor = {
  processFiles: vi.fn(),
  processAllFiles: vi.fn(),
  processing: false,
  error: null,
  progress: { phase: "idle", stage: null, percent: 0, elapsed: 0 },
  resultPayload: null as Record<string, unknown> | null,
  processedSize: null as number | null,
};

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => processor,
}));

import { CompressPdfSettings } from "@/components/tools/compress-pdf-settings";

afterEach(cleanup);

describe("compress-pdf target labels use the server's decimal KB (#1272)", () => {
  it("never shows a missed target next to a smaller achieved size", () => {
    processor.resultPayload = { targetKb: 100, targetMet: false };
    processor.processedSize = 100_400;

    render(<CompressPdfSettings />);

    // 100,400 bytes is over 100 KB (100,000 bytes). With 1024-byte KB this read
    // "Couldn't reach 100 KB. Smallest achievable was 98 KB".
    expect(screen.getByText(/100\.4 KB/)).toBeTruthy();
    expect(screen.queryByText(/\b98 KB\b/)).toBeNull();
  });
});
