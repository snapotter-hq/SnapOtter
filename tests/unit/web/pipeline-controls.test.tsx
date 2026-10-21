// @vitest-environment jsdom

import { act, cleanup, render, screen, within } from "@testing-library/react";
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

describe("GifToolsControls (#1223)", async () => {
  const { GifToolsControls } = await import("@/components/tools/gif-tools-settings");

  it("presents the four effective optimize palette sizes as buttons instead of a range slider", async () => {
    const onChange = vi.fn();
    const { container } = render(<GifToolsControls onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Optimize" }));

    const group = container.querySelector<HTMLElement>("#gif-colors");
    expect(group).not.toBeNull();
    if (!group) throw new Error("#gif-colors missing");
    expect(group.querySelector("input[type='range']")).toBeNull();

    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.textContent)).toEqual(["2", "4", "16", "256"]);
    expect(within(group).getByRole("button", { name: "256" }).getAttribute("aria-pressed")).toBe(
      "true",
    );

    for (const colors of [2, 4, 16, 256] as const) {
      await userEvent.click(within(group).getByRole("button", { name: String(colors) }));
      const pressed = within(group).getAllByRole("button", { pressed: true });
      expect(pressed.map((b) => b.textContent)).toEqual([String(colors)]);
      expect(onChange).toHaveBeenLastCalledWith({
        mode: "optimize",
        colors,
        dither: 1,
        effort: 7,
        loop: 0,
      });
    }
  });

  it("hydrates a valid optimize colors setting and ignores unsupported intermediate values", () => {
    const onChange = vi.fn();
    const { container } = render(
      <GifToolsControls settings={{ mode: "optimize", colors: 16 }} onChange={onChange} />,
    );
    const group = container.querySelector<HTMLElement>("#gif-colors");
    if (!group) throw new Error("#gif-colors missing");
    expect(within(group).getByRole("button", { name: "16" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "optimize", colors: 16 }),
    );

    cleanup();
    const onFallback = vi.fn();
    const { container: fallbackContainer } = render(
      <GifToolsControls settings={{ mode: "optimize", colors: 64 }} onChange={onFallback} />,
    );
    const fallbackGroup = fallbackContainer.querySelector<HTMLElement>("#gif-colors");
    if (!fallbackGroup) throw new Error("#gif-colors missing");
    expect(
      within(fallbackGroup).getByRole("button", { name: "256" }).getAttribute("aria-pressed"),
    ).toBe("true");
    expect(onFallback).toHaveBeenLastCalledWith(
      expect.objectContaining({ mode: "optimize", colors: 256 }),
    );
  });

  it("switches resizeTab to percentage when initialSettings has percentage without width or height (#2918)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <GifToolsControls settings={{ mode: "resize", percentage: 75 }} onChange={onChange} />,
    );
    const pctInput = container.querySelector<HTMLInputElement>("#gif-pct");
    expect(pctInput).not.toBeNull();
    expect(pctInput?.value).toBe("75");
    expect(onChange).toHaveBeenLastCalledWith({
      mode: "resize",
      percentage: 75,
      loop: 0,
    });

    cleanup();
    const onPixel = vi.fn();
    const { container: pixelContainer } = render(
      <GifToolsControls
        settings={{ mode: "resize", width: 320, percentage: 75 }}
        onChange={onPixel}
      />,
    );
    expect(pixelContainer.querySelector<HTMLInputElement>("#gif-width")?.value).toBe("320");
    expect(pixelContainer.querySelector<HTMLInputElement>("#gif-height")?.value).toBe("");
    expect(onPixel).toHaveBeenLastCalledWith({
      mode: "resize",
      width: 320,
      loop: 0,
    });
  });

  it("hydrates optimize dither, effort, and loop settings including dither 0 (#2918)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <GifToolsControls
        settings={{ mode: "optimize", colors: 16, dither: 0, effort: 9, loop: 3 }}
        onChange={onChange}
      />,
    );
    expect(container.querySelector<HTMLInputElement>("#gif-dither")?.value).toBe("0");
    expect(container.querySelector<HTMLInputElement>("#gif-effort")?.value).toBe("9");
    expect(container.querySelector<HTMLInputElement>("input[type='number']")?.value).toBe("3");
    expect(onChange).toHaveBeenLastCalledWith({
      mode: "optimize",
      colors: 16,
      dither: 0,
      effort: 9,
      loop: 3,
    });
  });

  it("hydrates speed, reverse, extract, and rotate pipeline step settings (#2918)", () => {
    const onSpeed = vi.fn();
    const { container: speedContainer } = render(
      <GifToolsControls
        settings={{ mode: "speed", speedFactor: 2.5, loop: 1 }}
        onChange={onSpeed}
      />,
    );
    expect(speedContainer.querySelector<HTMLInputElement>("#gif-speed")?.value).toBe("2.5");
    expect(onSpeed).toHaveBeenLastCalledWith({
      mode: "speed",
      speedFactor: 2.5,
      loop: 1,
    });
    cleanup();

    const onReverse = vi.fn();
    const { container: revContainer } = render(
      <GifToolsControls
        settings={{ mode: "reverse", speedFactor: 1.5, loop: 0 }}
        onChange={onReverse}
      />,
    );
    expect(revContainer.querySelector<HTMLInputElement>("input[type='checkbox']")?.checked).toBe(
      true,
    );
    expect(revContainer.querySelector<HTMLInputElement>("#gif-rev-speed")?.value).toBe("1.5");
    expect(onReverse).toHaveBeenLastCalledWith({
      mode: "reverse",
      speedFactor: 1.5,
      loop: 0,
    });
    cleanup();

    const onReverseDefault = vi.fn();
    const { container: revDefaultContainer } = render(
      <GifToolsControls settings={{ mode: "reverse", loop: 0 }} onChange={onReverseDefault} />,
    );
    expect(
      revDefaultContainer.querySelector<HTMLInputElement>("input[type='checkbox']")?.checked,
    ).toBe(false);
    expect(revDefaultContainer.querySelector("#gif-rev-speed")).toBeNull();
    expect(onReverseDefault).toHaveBeenLastCalledWith({
      mode: "reverse",
      loop: 0,
    });
    cleanup();

    const onExtractSingle = vi.fn();
    const { container: singleContainer } = render(
      <GifToolsControls
        settings={{
          mode: "extract",
          extractMode: "single",
          frameNumber: 4,
          extractFormat: "webp",
          loop: 0,
        }}
        onChange={onExtractSingle}
      />,
    );
    expect(singleContainer.querySelector<HTMLInputElement>("#gif-frame")?.value).toBe("4");
    expect(onExtractSingle).toHaveBeenLastCalledWith({
      mode: "extract",
      extractMode: "single",
      frameNumber: 4,
      extractFormat: "webp",
      loop: 0,
    });
    cleanup();

    const onExtractRange = vi.fn();
    const { container: rangeContainer } = render(
      <GifToolsControls
        settings={{
          mode: "extract",
          extractMode: "range",
          frameStart: 2,
          frameEnd: 8,
          extractFormat: "webp",
          loop: 0,
        }}
        onChange={onExtractRange}
      />,
    );
    expect(rangeContainer.querySelector<HTMLInputElement>("#gif-frame-start")?.value).toBe("2");
    expect(rangeContainer.querySelector<HTMLInputElement>("#gif-frame-end")?.value).toBe("8");
    expect(onExtractRange).toHaveBeenLastCalledWith({
      mode: "extract",
      extractMode: "range",
      frameStart: 2,
      frameEnd: 8,
      extractFormat: "webp",
      loop: 0,
    });
    cleanup();

    const onExtractAll = vi.fn();
    render(
      <GifToolsControls
        settings={{
          mode: "extract",
          extractMode: "all",
          extractFormat: "webp",
          loop: 1,
        }}
        onChange={onExtractAll}
      />,
    );
    expect(onExtractAll).toHaveBeenLastCalledWith({
      mode: "extract",
      extractMode: "all",
      extractFormat: "webp",
      loop: 1,
    });
    cleanup();

    const onRotate = vi.fn();
    render(
      <GifToolsControls
        settings={{ mode: "rotate", angle: 180, flipH: true, flipV: false, loop: 0 }}
        onChange={onRotate}
      />,
    );
    expect(onRotate).toHaveBeenLastCalledWith({
      mode: "rotate",
      angle: 180,
      flipH: true,
      flipV: false,
      loop: 0,
    });
    cleanup();

    const onRotateInvalidAngle = vi.fn();
    render(
      <GifToolsControls
        settings={{ mode: "rotate", angle: 45, flipH: false, flipV: true, loop: 0 }}
        onChange={onRotateInvalidAngle}
      />,
    );
    expect(onRotateInvalidAngle).toHaveBeenLastCalledWith({
      mode: "rotate",
      flipH: false,
      flipV: true,
      loop: 0,
    });
  });

  it("does not overwrite a provided loop setting when GIF metadata resolves (#2918)", async () => {
    const { useFileStore } = await import("@/stores/file-store");
    useFileStore.setState({
      files: [new File(["gif"], "anim.gif", { type: "image/gif" })],
      selectedIndex: 0,
    });
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async () =>
        new Response(
          JSON.stringify({
            width: 100,
            height: 100,
            pages: 4,
            delay: [100, 100, 100, 100],
            loop: 1,
            fileSize: 1024,
            duration: 400,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
    );

    try {
      const onChange = vi.fn();
      await act(async () => {
        render(
          <GifToolsControls
            settings={{ mode: "optimize", colors: 16, dither: 0.5, effort: 6, loop: 4 }}
            onChange={onChange}
          />,
        );
      });
      expect(screen.getByText("100x100")).toBeDefined();
      expect(onChange).toHaveBeenLastCalledWith({
        mode: "optimize",
        colors: 16,
        dither: 0.5,
        effort: 6,
        loop: 4,
      });

      cleanup();
      const onEmptyPipelineStep = vi.fn();
      await act(async () => {
        render(<GifToolsControls settings={{}} onChange={onEmptyPipelineStep} />);
      });
      expect(screen.getByText("100x100")).toBeDefined();
      expect(onEmptyPipelineStep).toHaveBeenLastCalledWith({
        mode: "resize",
        loop: 0,
      });

      cleanup();
      const onStandalone = vi.fn();
      await act(async () => {
        render(<GifToolsControls onChange={onStandalone} />);
      });
      expect(screen.getByText("100x100")).toBeDefined();
      expect(onStandalone).toHaveBeenLastCalledWith({
        mode: "resize",
        loop: 1,
      });
    } finally {
      cleanup();
      useFileStore.setState({ files: [], selectedIndex: 0 });
    }
  });

  it("keeps speed, reverse, and extract modes selectable in pipeline steps and before metadata resolves, and disables them only for a known static image on the standalone page (#2934)", async () => {
    const { useFileStore } = await import("@/stores/file-store");
    const { PipelineStepSettings } = await import("@/components/tools/pipeline-step-settings");
    try {
      const onPipelineNoFile = vi.fn();
      render(<GifToolsControls settings={{}} onChange={onPipelineNoFile} />);
      for (const label of ["Resize", "Optimize", "Speed", "Reverse", "Extract", "Rotate"]) {
        expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(
          false,
        );
      }

      await userEvent.click(screen.getByRole("button", { name: "Speed" }));
      expect(onPipelineNoFile).toHaveBeenLastCalledWith({
        mode: "speed",
        speedFactor: 1,
        loop: 0,
      });

      await userEvent.click(screen.getByRole("button", { name: "Reverse" }));
      expect(onPipelineNoFile).toHaveBeenLastCalledWith({
        mode: "reverse",
        loop: 0,
      });

      await userEvent.click(screen.getByRole("button", { name: "Extract" }));
      expect(onPipelineNoFile).toHaveBeenLastCalledWith({
        mode: "extract",
        extractMode: "single",
        frameNumber: 0,
        extractFormat: "png",
        loop: 0,
      });
      cleanup();

      const onStepSettings = vi.fn();
      render(<PipelineStepSettings toolId="gif-tools" settings={{}} onChange={onStepSettings} />);
      const speedBtn = await screen.findByRole("button", { name: "Speed" });
      expect((speedBtn as HTMLButtonElement).disabled).toBe(false);
      await userEvent.click(speedBtn);
      expect(onStepSettings).toHaveBeenLastCalledWith({
        mode: "speed",
        speedFactor: 1,
        loop: 0,
      });
      cleanup();

      const onStandalonePending = vi.fn();
      render(<GifToolsControls onChange={onStandalonePending} />);
      for (const label of ["Resize", "Optimize", "Speed", "Reverse", "Extract", "Rotate"]) {
        expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(
          false,
        );
      }
      await userEvent.click(screen.getByRole("button", { name: "Speed" }));
      expect(onStandalonePending).toHaveBeenLastCalledWith({
        mode: "speed",
        speedFactor: 1,
        loop: 0,
      });
      cleanup();

      useFileStore.setState({
        files: [new File(["gif"], "static.gif", { type: "image/gif" })],
        selectedIndex: 0,
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              width: 64,
              height: 64,
              pages: 1,
              delay: [],
              loop: 0,
              fileSize: 512,
              duration: 0,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      );

      const onPipelineWithStaticFile = vi.fn();
      await act(async () => {
        render(<GifToolsControls settings={{}} onChange={onPipelineWithStaticFile} />);
      });
      expect(screen.getByText("Static image")).toBeDefined();
      for (const label of ["Resize", "Optimize", "Speed", "Reverse", "Extract", "Rotate"]) {
        expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(
          false,
        );
      }
      await userEvent.click(screen.getByRole("button", { name: "Reverse" }));
      expect(onPipelineWithStaticFile).toHaveBeenLastCalledWith({
        mode: "reverse",
        loop: 0,
      });
      cleanup();

      const onStandaloneStatic = vi.fn();
      await act(async () => {
        render(<GifToolsControls onChange={onStandaloneStatic} />);
      });
      expect(screen.getByText("Static image")).toBeDefined();
      for (const label of ["Resize", "Optimize", "Rotate"]) {
        const btn = screen.getByRole("button", { name: label }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        expect(btn.getAttribute("title")).toBeNull();
      }
      for (const label of ["Speed", "Reverse", "Extract"]) {
        const btn = screen.getByRole("button", { name: label }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute("title")).toBe("Requires animated GIF");
      }
      cleanup();

      useFileStore.setState({
        files: [new File(["gif"], "animated.gif", { type: "image/gif" })],
        selectedIndex: 0,
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () =>
          new Response(
            JSON.stringify({
              width: 64,
              height: 64,
              pages: 4,
              delay: [100, 100, 100, 100],
              loop: 0,
              fileSize: 1024,
              duration: 400,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
      );

      const onStandaloneAnimated = vi.fn();
      await act(async () => {
        render(<GifToolsControls onChange={onStandaloneAnimated} />);
      });
      for (const label of ["Resize", "Optimize", "Speed", "Reverse", "Extract", "Rotate"]) {
        const btn = screen.getByRole("button", { name: label }) as HTMLButtonElement;
        expect(btn.disabled).toBe(false);
        expect(btn.getAttribute("title")).toBeNull();
      }
      cleanup();

      let resolveDeferredFetch!: (res: Response) => void;
      useFileStore.setState({
        files: [new File(["gif"], "deferred-static.gif", { type: "image/gif" })],
        selectedIndex: 0,
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveDeferredFetch = resolve;
          }),
      );

      const onStandaloneDeferred = vi.fn();
      render(<GifToolsControls onChange={onStandaloneDeferred} />);
      expect(screen.getByText("Reading GIF metadata...")).toBeDefined();
      for (const label of ["Resize", "Optimize", "Speed", "Reverse", "Extract", "Rotate"]) {
        expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(
          false,
        );
      }
      await act(async () => {
        resolveDeferredFetch(
          new Response(
            JSON.stringify({
              width: 32,
              height: 32,
              pages: 1,
              delay: [],
              loop: 0,
              fileSize: 256,
              duration: 0,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      expect(screen.getByText("Static image")).toBeDefined();
      for (const label of ["Speed", "Reverse", "Extract"]) {
        const btn = screen.getByRole("button", { name: label }) as HTMLButtonElement;
        expect(btn.disabled).toBe(true);
        expect(btn.getAttribute("title")).toBe("Requires animated GIF");
      }
      cleanup();

      useFileStore.setState({
        files: [new File(["not-a-gif"], "broken.gif", { type: "image/gif" })],
        selectedIndex: 0,
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        async () => new Response(JSON.stringify({ error: "Invalid GIF" }), { status: 422 }),
      );
      const onStandaloneError = vi.fn();
      await act(async () => {
        render(<GifToolsControls onChange={onStandaloneError} />);
      });
      for (const label of ["Resize", "Optimize", "Speed", "Reverse", "Extract", "Rotate"]) {
        expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(
          false,
        );
      }
    } finally {
      cleanup();
      useFileStore.setState({ files: [], selectedIndex: 0 });
    }
  });

  it("resets speed, reverse, and extract to resize when standalone metadata resolves as a static image (#3311)", async () => {
    const { useFileStore } = await import("@/stores/file-store");
    try {
      for (const animMode of [
        { label: "Speed", expectedPending: { mode: "speed", speedFactor: 1, loop: 0 } },
        { label: "Reverse", expectedPending: { mode: "reverse", loop: 0 } },
        {
          label: "Extract",
          expectedPending: {
            mode: "extract",
            extractMode: "single",
            frameNumber: 0,
            extractFormat: "png",
            loop: 0,
          },
        },
      ] as const) {
        let resolveDeferredFetch!: (res: Response) => void;
        useFileStore.setState({
          files: [
            new File(["gif"], `pending-${animMode.label}.gif`, {
              type: "image/gif",
            }),
          ],
          selectedIndex: 0,
        });
        vi.spyOn(globalThis, "fetch").mockImplementation(
          () =>
            new Promise<Response>((resolve) => {
              resolveDeferredFetch = resolve;
            }),
        );

        const onPendingToStatic = vi.fn();
        const { container } = render(<GifToolsControls onChange={onPendingToStatic} />);
        await userEvent.click(screen.getByRole("button", { name: animMode.label }));
        expect(onPendingToStatic).toHaveBeenLastCalledWith(animMode.expectedPending);

        await act(async () => {
          resolveDeferredFetch(
            new Response(
              JSON.stringify({
                width: 32,
                height: 32,
                pages: 1,
                delay: [],
                loop: 0,
                fileSize: 256,
                duration: 0,
              }),
              { status: 200, headers: { "Content-Type": "application/json" } },
            ),
          );
        });

        expect(screen.getByText("Static image")).toBeDefined();
        expect(
          (screen.getByRole("button", { name: animMode.label }) as HTMLButtonElement).disabled,
        ).toBe(true);
        expect(container.querySelector("#gif-width")).not.toBeNull();
        expect(onPendingToStatic).toHaveBeenLastCalledWith({
          mode: "resize",
          loop: 0,
        });
        cleanup();
      }

      const animFile = new File(["gif-anim"], "anim-switch.gif", { type: "image/gif" });
      const staticFile = new File(["gif-static"], "static-switch.gif", { type: "image/gif" });
      vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) => {
        const body = init?.body as FormData | undefined;
        const uploaded = body?.get("file") as File | null;
        const isStatic = uploaded?.name === "static-switch.gif";
        return new Response(
          JSON.stringify({
            width: 64,
            height: 64,
            pages: isStatic ? 1 : 4,
            delay: isStatic ? [] : [100, 100, 100, 100],
            loop: 0,
            fileSize: isStatic ? 512 : 1024,
            duration: isStatic ? 0 : 400,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      useFileStore.setState({
        files: [animFile, staticFile],
        selectedIndex: 0,
      });

      const onSwitch = vi.fn();
      const { container: switchContainer } = await act(async () =>
        render(<GifToolsControls onChange={onSwitch} />),
      );
      await userEvent.click(screen.getByRole("button", { name: "Speed" }));
      expect(switchContainer.querySelector("#gif-speed")).not.toBeNull();
      expect(onSwitch).toHaveBeenLastCalledWith({
        mode: "speed",
        speedFactor: 1,
        loop: 0,
      });

      await act(async () => {
        useFileStore.setState({ selectedIndex: 1 });
      });

      expect(screen.getByText("Static image")).toBeDefined();
      expect((screen.getByRole("button", { name: "Speed" }) as HTMLButtonElement).disabled).toBe(
        true,
      );
      expect(switchContainer.querySelector("#gif-speed")).toBeNull();
      expect(switchContainer.querySelector("#gif-width")).not.toBeNull();
      expect(onSwitch).toHaveBeenLastCalledWith({
        mode: "resize",
        loop: 0,
      });

      await userEvent.click(screen.getByRole("button", { name: "Optimize" }));
      expect(onSwitch).toHaveBeenLastCalledWith({
        mode: "optimize",
        colors: 256,
        dither: 1,
        effort: 7,
        loop: 0,
      });
      await act(async () => {
        useFileStore.setState({ selectedIndex: 0 });
      });
      await act(async () => {
        useFileStore.setState({ selectedIndex: 1 });
      });
      expect(onSwitch).toHaveBeenLastCalledWith({
        mode: "optimize",
        colors: 256,
        dither: 1,
        effort: 7,
        loop: 0,
      });
      cleanup();

      const onHydratedPipelineStatic = vi.fn();
      await act(async () =>
        render(
          <GifToolsControls
            settings={{ mode: "speed", speedFactor: 2, loop: 0 }}
            onChange={onHydratedPipelineStatic}
          />,
        ),
      );
      expect(screen.getByText("Static image")).toBeDefined();
      expect(onHydratedPipelineStatic).toHaveBeenLastCalledWith({
        mode: "speed",
        speedFactor: 2,
        loop: 0,
      });
    } finally {
      cleanup();
      useFileStore.setState({ files: [], selectedIndex: 0 });
    }
  });

  it("omits extract frame max and range hint when metadata is absent or in pipeline steps, and applies them when standalone metadata resolves (#3312)", async () => {
    const { useFileStore } = await import("@/stores/file-store");
    try {
      const onPipelineExtract = vi.fn();
      const { container: pipelineContainer } = render(
        <GifToolsControls
          settings={{ mode: "extract", extractMode: "single", frameNumber: 5 }}
          onChange={onPipelineExtract}
        />,
      );
      const singleFrameInput = pipelineContainer.querySelector<HTMLInputElement>("#gif-frame");
      expect(singleFrameInput).not.toBeNull();
      expect(singleFrameInput?.getAttribute("max")).toBeNull();
      expect(singleFrameInput?.checkValidity()).toBe(true);
      expect(screen.queryByText(/0 is first frame/i)).toBeNull();

      await userEvent.click(screen.getByRole("button", { name: "Range" }));
      const startInput = pipelineContainer.querySelector<HTMLInputElement>("#gif-frame-start");
      const endInput = pipelineContainer.querySelector<HTMLInputElement>("#gif-frame-end");
      expect(startInput?.getAttribute("max")).toBeNull();
      expect(endInput?.getAttribute("max")).toBeNull();
      expect(endInput?.getAttribute("placeholder")).toBeNull();
      cleanup();

      let resolveDeferredFetch!: (res: Response) => void;
      useFileStore.setState({
        files: [new File(["gif"], "deferred-extract.gif", { type: "image/gif" })],
        selectedIndex: 0,
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveDeferredFetch = resolve;
          }),
      );

      const onPipelineWithLoadedGif = vi.fn();
      const { container: pipelineLoadedContainer } = render(
        <GifToolsControls
          settings={{ mode: "extract", extractMode: "range", frameStart: 0, frameEnd: 12 }}
          onChange={onPipelineWithLoadedGif}
        />,
      );
      await act(async () => {
        resolveDeferredFetch(
          new Response(
            JSON.stringify({
              width: 64,
              height: 64,
              pages: 5,
              delay: [100, 100, 100, 100, 100],
              loop: 0,
              fileSize: 1024,
              duration: 500,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });
      expect(
        pipelineLoadedContainer
          .querySelector<HTMLInputElement>("#gif-frame-start")
          ?.getAttribute("max"),
      ).toBeNull();
      expect(
        pipelineLoadedContainer
          .querySelector<HTMLInputElement>("#gif-frame-end")
          ?.getAttribute("max"),
      ).toBeNull();
      expect(
        pipelineLoadedContainer
          .querySelector<HTMLInputElement>("#gif-frame-end")
          ?.getAttribute("placeholder"),
      ).toBeNull();
      await userEvent.click(screen.getByRole("button", { name: "Single" }));
      expect(
        pipelineLoadedContainer.querySelector<HTMLInputElement>("#gif-frame")?.getAttribute("max"),
      ).toBeNull();
      expect(screen.queryByText(/0 is first frame/i)).toBeNull();
      cleanup();

      let resolveStandaloneFetch!: (res: Response) => void;
      useFileStore.setState({
        files: [new File(["gif"], "standalone-extract.gif", { type: "image/gif" })],
        selectedIndex: 0,
      });
      vi.spyOn(globalThis, "fetch").mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolveStandaloneFetch = resolve;
          }),
      );

      const onStandaloneExtract = vi.fn();
      const { container: standaloneContainer } = render(
        <GifToolsControls onChange={onStandaloneExtract} />,
      );
      await userEvent.click(screen.getByRole("button", { name: "Extract" }));
      expect(
        standaloneContainer.querySelector<HTMLInputElement>("#gif-frame")?.getAttribute("max"),
      ).toBeNull();
      expect(screen.queryByText(/0 is first frame/i)).toBeNull();

      await userEvent.click(screen.getByRole("button", { name: "Range" }));
      expect(
        standaloneContainer
          .querySelector<HTMLInputElement>("#gif-frame-start")
          ?.getAttribute("max"),
      ).toBeNull();
      expect(
        standaloneContainer.querySelector<HTMLInputElement>("#gif-frame-end")?.getAttribute("max"),
      ).toBeNull();
      expect(
        standaloneContainer
          .querySelector<HTMLInputElement>("#gif-frame-end")
          ?.getAttribute("placeholder"),
      ).toBeNull();

      await act(async () => {
        resolveStandaloneFetch(
          new Response(
            JSON.stringify({
              width: 64,
              height: 64,
              pages: 6,
              delay: [100, 100, 100, 100, 100, 100],
              loop: 0,
              fileSize: 1024,
              duration: 600,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          ),
        );
      });

      expect(
        standaloneContainer
          .querySelector<HTMLInputElement>("#gif-frame-start")
          ?.getAttribute("max"),
      ).toBe("5");
      expect(
        standaloneContainer.querySelector<HTMLInputElement>("#gif-frame-end")?.getAttribute("max"),
      ).toBe("5");
      expect(
        standaloneContainer
          .querySelector<HTMLInputElement>("#gif-frame-end")
          ?.getAttribute("placeholder"),
      ).toBe("5");

      await userEvent.click(screen.getByRole("button", { name: "Single" }));
      expect(
        standaloneContainer.querySelector<HTMLInputElement>("#gif-frame")?.getAttribute("max"),
      ).toBe("5");
      expect(screen.getByText("0 to 5 (0 is first frame)")).toBeDefined();

      await act(async () => {
        useFileStore.setState({ files: [], selectedIndex: 0 });
      });
      expect(
        standaloneContainer.querySelector<HTMLInputElement>("#gif-frame")?.getAttribute("max"),
      ).toBeNull();
      expect(screen.queryByText(/0 is first frame/i)).toBeNull();

      await userEvent.click(screen.getByRole("button", { name: "Range" }));
      expect(
        standaloneContainer
          .querySelector<HTMLInputElement>("#gif-frame-start")
          ?.getAttribute("max"),
      ).toBeNull();
      expect(
        standaloneContainer.querySelector<HTMLInputElement>("#gif-frame-end")?.getAttribute("max"),
      ).toBeNull();
      expect(
        standaloneContainer
          .querySelector<HTMLInputElement>("#gif-frame-end")
          ?.getAttribute("placeholder"),
      ).toBeNull();
    } finally {
      cleanup();
      useFileStore.setState({ files: [], selectedIndex: 0 });
    }
  });
});
