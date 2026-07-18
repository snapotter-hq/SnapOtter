// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
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

  it("omits sampleRate by default (preserve original)", () => {
    const onChange = vi.fn();
    render(<ConvertAudioControls onChange={onChange} />);
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("sampleRate");
  });

  it("emits the chosen sample rate on change", async () => {
    const onChange = vi.fn();
    render(<ConvertAudioControls onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/sample rate/i), "44100");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sampleRate: 44100 }));
  });

  it("initializes sampleRate from incoming settings", () => {
    const onChange = vi.fn();
    render(
      <ConvertAudioControls settings={{ format: "wav", sampleRate: 48000 }} onChange={onChange} />,
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ format: "wav", sampleRate: 48000 }),
    );
  });

  it("caps bitrate options for low mp3 sample rates and resets the bitrate", async () => {
    const onChange = vi.fn();
    render(<ConvertAudioControls onChange={onChange} />);
    await userEvent.selectOptions(screen.getByLabelText(/sample rate/i), "8000");
    // 192 kbps is illegal at 8 kHz (libmp3lame caps at 64); the control must
    // reset to a legal value rather than let ffmpeg clamp silently.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sampleRate: 8000, bitrateKbps: 64 }),
    );
    const bitrateSelect = screen.getByLabelText(/bitrate/i);
    const options = [...bitrateSelect.querySelectorAll("option")].map((o) => o.value);
    expect(options).toEqual(["32", "48", "64"]);

    // Moving back to a full-range rate restores the regular options.
    await userEvent.selectOptions(screen.getByLabelText(/sample rate/i), "44100");
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ sampleRate: 44100, bitrateKbps: 192 }),
    );
  });

  it("sanitizes an out-of-range stored sampleRate to preserve-original", () => {
    const onChange = vi.fn();
    render(
      <ConvertAudioControls settings={{ format: "mp3", sampleRate: 96000 }} onChange={onChange} />,
    );
    // A stale or API-written value the UI cannot represent must not be emitted
    // behind a blank select.
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ format: "mp3" });
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("sampleRate");
  });

  it("hides 96 kHz for mp3 and drops it when switching to mp3", async () => {
    const onChange = vi.fn();
    render(<ConvertAudioControls settings={{ format: "wav" }} onChange={onChange} />);
    const rateSelect = screen.getByLabelText(/sample rate/i);
    await userEvent.selectOptions(rateSelect, "96000");
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ sampleRate: 96000 }));

    await userEvent.selectOptions(screen.getByLabelText(/output format/i), "mp3");
    expect(onChange.mock.lastCall?.[0]).toMatchObject({ format: "mp3" });
    expect(onChange.mock.lastCall?.[0]).not.toHaveProperty("sampleRate");
    expect(within(rateSelect).queryByRole("option", { name: /96000/ })).toBeNull();
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
