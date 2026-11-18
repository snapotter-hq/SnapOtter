// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";

import type { FeatureBundleState } from "@snapotter/shared";
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

import { TransparencyFixerSettings } from "@/components/tools/transparency-fixer-settings";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";

const GIB = 1024 ** 3;

function backgroundRemoval(extra: Partial<FeatureBundleState> = {}): FeatureBundleState {
  return {
    id: "background-removal",
    name: "Background Removal",
    description: "",
    status: "installed",
    installedVersion: "2.0.0",
    estimatedSize: "4-5 GB",
    enablesTools: ["remove-background", "transparency-fixer"],
    progress: null,
    error: null,
    ...extra,
  };
}

beforeEach(() => {
  useFileStore.setState({
    files: [new File([new Uint8Array(10)], "a.png", { type: "image/png" })],
  } as never);
});

afterEach(() => {
  cleanup();
  useFeaturesStore.setState({ bundles: [] });
});

// #4808: a CPU host under the HR matting floor can never run the tool, so the
// panel says why before an upload instead of a 422 after it.
describe("transparency-fixer on a host without enough memory", () => {
  it("disables the submit button and shows the memory figures", () => {
    useFeaturesStore.setState({
      bundles: [
        backgroundRemoval({
          unavailableTools: [
            {
              toolId: "transparency-fixer",
              reason: "insufficient-memory",
              requiredMemoryBytes: 25 * GIB,
              hostMemoryBytes: 15.6 * GIB,
            },
          ],
        }),
      ],
    });
    render(<TransparencyFixerSettings />);

    expect(screen.getByTestId("transparency-fixer-submit")).toBeDisabled();
    const notice = screen.getByTestId("transparency-fixer-memory-unavailable");
    expect(notice).toHaveTextContent("15 GB");
    expect(notice).toHaveTextContent("25 GB");
  });

  it("keeps the tool enabled when the bundle reports no unavailable tools", () => {
    useFeaturesStore.setState({ bundles: [backgroundRemoval()] });
    render(<TransparencyFixerSettings />);

    expect(screen.getByTestId("transparency-fixer-submit")).toBeEnabled();
    expect(screen.queryByTestId("transparency-fixer-memory-unavailable")).toBeNull();
  });
});
