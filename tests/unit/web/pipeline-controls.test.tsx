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
