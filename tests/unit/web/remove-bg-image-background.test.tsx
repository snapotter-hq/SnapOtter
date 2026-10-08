// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({ processAllFiles: vi.fn() }));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: processor.processAllFiles,
    processing: false,
    error: null,
    downloadUrl: null,
    originalSize: null,
    processedSize: null,
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { PipelineStepSettings } from "@/components/tools/pipeline-step-settings";
import {
  RemoveBgControls,
  RemoveBgPipelineControls,
  RemoveBgSettings,
} from "@/components/tools/remove-bg-settings";
import { useFileStore } from "@/stores/file-store";

const imageLabel = en.toolSettings["remove-bg"].image;
const png = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  processor.processAllFiles.mockClear();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().setFiles([]);
});

// Pipelines and multi-file runs cannot carry an uploaded background image, so
// the server answers 400 for backgroundType "image" there (#1047). The UI must
// not offer it (#2074).
describe("remove-background image background option (#2074)", () => {
  it("offers the Image background by default", () => {
    render(<RemoveBgControls settings={{}} onChange={() => {}} />);
    expect(screen.getByRole("button", { name: imageLabel })).toBeInTheDocument();
  });

  it("hides it when allowImageBackground is false", () => {
    render(<RemoveBgControls settings={{}} onChange={() => {}} allowImageBackground={false} />);
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: en.toolSettings["remove-bg"].color })).toBeVisible();
  });

  it("hides it in a pipeline step", () => {
    render(<RemoveBgPipelineControls settings={{}} onChange={() => {}} />);
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
  });

  it("emits transparent for a stored image background it cannot offer", () => {
    const onChange = vi.fn();
    render(<RemoveBgPipelineControls settings={{ backgroundType: "image" }} onChange={onChange} />);
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.backgroundType).toBe("transparent");
  });

  it("keeps a stored image background when it is allowed", () => {
    const onChange = vi.fn();
    render(<RemoveBgControls settings={{ backgroundType: "image" }} onChange={onChange} />);
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.backgroundType).toBe("image");
  });

  it("offers it on the tool page for one file and hides it for several", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    const { unmount } = render(<RemoveBgSettings />);
    expect(screen.getByRole("button", { name: imageLabel })).toBeInTheDocument();
    unmount();

    useFileStore.getState().setFiles([png("a.png"), png("b.png")]);
    render(<RemoveBgSettings />);
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
  });

  it("registers the pipeline step with the controls that hide it", async () => {
    const onChange = vi.fn();
    render(
      <PipelineStepSettings
        toolId="remove-background"
        settings={{ backgroundType: "image" }}
        onChange={onChange}
      />,
    );
    await screen.findByRole("button", { name: en.toolSettings["remove-bg"].color });
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
    const last = onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(last.backgroundType).toBe("transparent");
  });

  it("follows the file count on a mounted page and never sends image for several files", () => {
    useFileStore.getState().setFiles([png("a.png")]);
    render(<RemoveBgSettings />);
    fireEvent.click(screen.getByRole("button", { name: imageLabel }));

    act(() => useFileStore.getState().setFiles([png("a.png"), png("b.png")]));
    expect(screen.queryByRole("button", { name: imageLabel })).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("remove-background-submit"));
    const sent = processor.processAllFiles.mock.calls[0][1] as Record<string, unknown>;
    expect(sent.backgroundType).toBe("transparent");
    expect(sent._bgImageFile).toBeUndefined();

    act(() => useFileStore.getState().setFiles([png("a.png")]));
    expect(screen.getByRole("button", { name: imageLabel })).toBeInTheDocument();
  });
});
