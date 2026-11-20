// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const processor = vi.hoisted(() => ({ warning: null as string | null }));

vi.mock("@/hooks/use-tool-processor", () => ({
  useToolProcessor: () => ({
    processFiles: vi.fn(),
    processAllFiles: vi.fn(),
    processing: false,
    error: null,
    warning: processor.warning,
    downloadUrl: "/api/v1/download/JOB/tone.txt",
    progress: { phase: "idle", percent: 0, stage: "", elapsed: 0 },
  }),
}));

import { AutoSubtitlesSettings } from "@/components/tools/auto-subtitles-settings";
import { TranscribeAudioSettings } from "@/components/tools/transcribe-audio-settings";
import { useFileStore } from "@/stores/file-store";

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  useFileStore.getState().setFiles([new File(["x"], "tone.wav", { type: "audio/wav" })]);
});

afterEach(() => {
  cleanup();
  processor.warning = null;
  useFileStore.getState().setFiles([]);
});

// The empty transcript of a file with no speech downloads with an explanation (#4923).
describe.each([
  ["transcribe-audio", TranscribeAudioSettings],
  ["auto-subtitles", AutoSubtitlesSettings],
])("%s no-speech warning", (_toolId, Settings) => {
  it("explains an empty result when the job warns there was no speech", () => {
    processor.warning = "No speech was detected in this file.";
    render(<Settings />);

    expect(screen.getByText("No speech was detected in this file.")).toBeInTheDocument();
  });

  it("stays quiet when speech was transcribed", () => {
    render(<Settings />);

    expect(screen.queryByText("No speech was detected in this file.")).not.toBeInTheDocument();
  });
});
