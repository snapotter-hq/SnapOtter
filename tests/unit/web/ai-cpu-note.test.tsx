// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RemoveBgControls } from "@/components/tools/remove-bg-settings";
import {
  UpscaleControls,
  UpscaleCpuFitHint,
  UpscaleCpuResizeNote,
  UpscaleSettings,
} from "@/components/tools/upscale-settings";
import { useFeaturesStore } from "@/stores/features-store";
import { type FileEntry, useFileStore } from "@/stores/file-store";

afterEach(cleanup);

// A user on a CPU-only NUC was surprised AI upscale timed out ("unless my
// system is just underpowered"). These notices set that expectation up front.
describe("AI CPU expectation notice (#591)", () => {
  it("upscale settings warn that it is slow without a GPU", () => {
    render(<UpscaleControls />);
    expect(screen.getByTestId("upscale-cpu-note")).toHaveTextContent(
      en.toolSettings.upscale.cpuNote,
    );
    expect(en.toolSettings.upscale.cpuNote).toMatch(/GPU/);
  });

  it("remove-background settings warn that it is slow without a GPU", () => {
    render(<RemoveBgControls settings={{}} onChange={() => {}} />);
    expect(screen.getByTestId("remove-bg-cpu-note")).toHaveTextContent(
      en.toolSettings["remove-background"].cpuNote,
    );
    expect(en.toolSettings["remove-background"].cpuNote).toMatch(/GPU/);
  });
});

// A CPU-only server reduces a large photo before upscaling instead of
// refusing it, and the result says so (#4820).
describe("upscale CPU resize note (#4820)", () => {
  it("names the size the server reduced the input to", () => {
    render(<UpscaleCpuResizeNote resizedTo={{ width: 2309, height: 1732 }} />);
    const note = screen.getByTestId("upscale-cpu-resized-note");
    expect(note).toHaveTextContent("2309 × 1732");
    expect(note).toHaveTextContent(/GPU/);
  });

  it("renders nothing when the input was not reduced or the payload is malformed", () => {
    const { container, rerender } = render(<UpscaleCpuResizeNote resizedTo={undefined} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<UpscaleCpuResizeNote resizedTo={{ width: "2309", height: 1732 }} />);
    expect(container).toBeEmptyDOMElement();
  });
});

// The resize used to show up only after the upload and the wait (#5036). The
// panel now warns before the run, with the size the server will use.
describe("upscale CPU fit hint (#5036)", () => {
  it("names the size a 12 MP photo is reduced to on a 4 MP CPU host", () => {
    render(<UpscaleCpuFitHint width={4032} height={3024} scale={2} model="auto" maxCpuMp={4} />);
    const hint = screen.getByTestId("upscale-cpu-fit-hint");
    expect(hint).toHaveTextContent("2309 × 1732");
    expect(hint).toHaveTextContent(/GPU/);
  });

  it("follows the output ceiling at 8x, lanczos included", () => {
    // 64 MP / 8^2 = 1 MP, which binds before the 4 MP input cap.
    render(<UpscaleCpuFitHint width={2000} height={1500} scale={8} model="lanczos" maxCpuMp={4} />);
    expect(screen.getByTestId("upscale-cpu-fit-hint")).toHaveTextContent("1154 × 866");
  });

  it("stays silent when it fits, on a GPU host, with no cap, or before the size is known", () => {
    const { container, rerender } = render(
      <UpscaleCpuFitHint width={1600} height={1200} scale={2} model="auto" maxCpuMp={4} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(
      <UpscaleCpuFitHint width={4032} height={3024} scale={2} model="auto" maxCpuMp={null} />,
    );
    expect(container).toBeEmptyDOMElement();
    rerender(<UpscaleCpuFitHint width={4032} height={3024} scale={2} model="auto" maxCpuMp={0} />);
    expect(container).toBeEmptyDOMElement();
    rerender(<UpscaleCpuFitHint width={null} height={null} scale={2} model="auto" maxCpuMp={4} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("stays silent when the server will refuse rather than reduce", () => {
    // 48 MP at 2x fits to 4 MP and lands at 16 MP, smaller than the original.
    render(<UpscaleCpuFitHint width={8000} height={6000} scale={2} model="auto" maxCpuMp={4} />);
    expect(screen.queryByTestId("upscale-cpu-fit-hint")).toBeNull();
  });

  describe("in the upscale panel", () => {
    const initialFiles = useFileStore.getState();
    const initialFeatures = useFeaturesStore.getState();

    afterEach(() => {
      useFileStore.setState(initialFiles, true);
      useFeaturesStore.setState(initialFeatures, true);
    });

    function selectPhoto(width: number, height: number) {
      const entry = {
        id: "photo",
        file: new File(["x"], "photo.heic", { type: "image/heic" }),
        blobUrl: "",
        originalWidth: width,
        originalHeight: height,
      } as unknown as FileEntry;
      useFileStore.setState({ currentEntry: entry, files: [entry.file] });
    }

    it("warns for the selected photo and tracks the chosen scale", () => {
      useFeaturesStore.setState({ upscaleCpuMaxMp: 4 });
      selectPhoto(4032, 3024);
      render(<UpscaleSettings />);
      expect(screen.getByTestId("upscale-cpu-fit-hint")).toHaveTextContent("2309 × 1732");

      act(() => {
        fireEvent.click(screen.getByRole("button", { name: "8x" }));
      });
      expect(screen.getByTestId("upscale-cpu-fit-hint")).toHaveTextContent("1154 × 866");
    });

    it("says nothing when the server may have a GPU", () => {
      useFeaturesStore.setState({ upscaleCpuMaxMp: null });
      selectPhoto(4032, 3024);
      render(<UpscaleSettings />);
      expect(screen.queryByTestId("upscale-cpu-fit-hint")).toBeNull();
    });
  });
});
