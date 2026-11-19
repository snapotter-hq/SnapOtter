// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RemoveBgControls } from "@/components/tools/remove-bg-settings";
import { UpscaleControls, UpscaleCpuResizeNote } from "@/components/tools/upscale-settings";

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
