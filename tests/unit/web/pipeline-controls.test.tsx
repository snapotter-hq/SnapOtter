// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ConvertAudioControls } from "@/components/tools/convert-audio-settings";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ConvertAudioControls", () => {
  it("emits valid defaults on mount", () => {
    const onChange = vi.fn();
    render(<ConvertAudioControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: "mp3", bitrateKbps: 192 }),
    );
  });

  it("emits the chosen format on change", async () => {
    const onChange = vi.fn();
    render(<ConvertAudioControls onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/output format/i), "flac");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ format: "flac" }));
  });

  it("emits the chosen bitrate on change", async () => {
    const onChange = vi.fn();
    render(<ConvertAudioControls onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/bitrate/i), "320");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ bitrateKbps: 320 }));
  });

  it("initializes from incoming settings once", () => {
    const onChange = vi.fn();
    render(
      <ConvertAudioControls settings={{ format: "wav", bitrateKbps: 256 }} onChange={onChange} />,
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: "wav", bitrateKbps: 256 }),
    );
  });
});

describe("TrimVideoControls", async () => {
  const { TrimVideoControls } = await import("@/components/tools/trim-video-settings");

  it("emits valid defaults on mount", () => {
    const onChange = vi.fn();
    render(<TrimVideoControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ startS: 0, endS: 0, precise: false }),
    );
  });
});

describe("RotateVideoControls", async () => {
  const { RotateVideoControls } = await import("@/components/tools/rotate-video-settings");

  it("emits valid defaults on mount", () => {
    const onChange = vi.fn();
    render(<RotateVideoControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ transform: "cw90" }));
  });
});

describe("AudioChannelsControls", async () => {
  const { AudioChannelsControls } = await import("@/components/tools/audio-channels-settings");

  it("emits valid defaults on mount", () => {
    const onChange = vi.fn();
    render(<AudioChannelsControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ mode: "stereo-to-mono" }));
  });
});

describe("RotatePdfControls", async () => {
  const { RotatePdfControls } = await import("@/components/tools/rotate-pdf-settings");

  it("emits valid defaults on mount", () => {
    const onChange = vi.fn();
    render(<RotatePdfControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ angle: 90, range: "1-z" }));
  });
});

describe("RedactPdfControls", async () => {
  const { RedactPdfControls } = await import("@/components/tools/redact-pdf-settings");

  it("emits empty terms array on mount", () => {
    const onChange = vi.fn();
    render(<RedactPdfControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ terms: [], caseSensitive: false }),
    );
  });

  it("splits comma-separated input into terms array", async () => {
    const onChange = vi.fn();
    render(<RedactPdfControls onChange={onChange} />);
    const input = screen.getByRole("textbox");
    await userEvent.type(input, "foo, bar, baz");
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall.terms).toEqual(["foo", "bar", "baz"]);
  });
});

describe("NupPdfControls", async () => {
  const { NupPdfControls } = await import("@/components/tools/nup-pdf-settings");

  it("emits perSheet as a number on mount", () => {
    const onChange = vi.fn();
    render(<NupPdfControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ perSheet: 2 }));
  });
});

describe("ChartMakerControls", async () => {
  const { ChartMakerControls } = await import("@/components/tools/chart-maker-settings");

  it("emits valid defaults on mount", () => {
    const onChange = vi.fn();
    render(<ChartMakerControls onChange={onChange} />);
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "bar", width: 960, height: 540 }),
    );
  });
});
