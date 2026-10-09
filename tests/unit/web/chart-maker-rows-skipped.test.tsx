// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processing: false,
    error: null,
    downloadUrl: "/api/v1/download/JOB/data_chart.png",
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { ChartMakerSettings } from "@/components/tools/chart-maker-settings";
import { useFileStore } from "@/stores/file-store";

const csv = () => new File(["month,sales\n"], "data.csv", { type: "text/csv" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  useFileStore.getState().setFiles([csv()]);
});

afterEach(() => {
  cleanup();
  useFileStore.getState().setFiles([]);
});

describe("Chart Maker says when rows were left out (#2060)", () => {
  it("shows how many rows made the chart and how many were skipped", () => {
    act(() =>
      useFileStore.getState().updateEntry(0, {
        status: "completed",
        resultNotes: { chartRows: { charted: 4, skipped: 2 } },
      }),
    );
    render(<ChartMakerSettings />);

    expect(screen.getByTestId("chart-maker-rows-skipped")).toHaveTextContent(
      "Rows charted: 4 of 6. Skipped because the value column had no number: 2.",
    );
  });

  it("says nothing when every row made it", () => {
    act(() => useFileStore.getState().updateEntry(0, { status: "completed", resultNotes: null }));
    render(<ChartMakerSettings />);

    expect(screen.queryByTestId("chart-maker-rows-skipped")).not.toBeInTheDocument();
  });
});
