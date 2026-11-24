// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextOverlayControls } from "@/components/tools/text-overlay-settings";

afterEach(() => {
  cleanup();
});

function lastSettings(onChange: ReturnType<typeof vi.fn>) {
  return onChange.mock.calls.at(-1)?.[0] as Record<string, unknown>;
}

// #777: long text wraps and the box can be placed freely.
describe("TextOverlayControls", () => {
  it("sends wrap on at 90% and the old bottom position by default", () => {
    const onChange = vi.fn();
    render(<TextOverlayControls onChange={onChange} />);
    expect(lastSettings(onChange)).toMatchObject({ position: "bottom", wrap: true, maxWidth: 90 });
    expect(screen.queryByLabelText("Horizontal Position")).toBeNull();
  });

  it("shows x and y sliders for a custom position and sends their values", () => {
    const onChange = vi.fn();
    render(<TextOverlayControls onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Position"), { target: { value: "custom" } });
    fireEvent.change(screen.getByLabelText("Horizontal Position"), { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Vertical Position"), { target: { value: "75" } });
    expect(lastSettings(onChange)).toMatchObject({ position: "custom", x: 20, y: 75 });
  });

  it("hides the max width slider when wrapping is off", () => {
    const onChange = vi.fn();
    render(<TextOverlayControls onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Max Width"), { target: { value: "50" } });
    expect(lastSettings(onChange)).toMatchObject({ maxWidth: 50 });
    fireEvent.click(screen.getByLabelText("Wrap Long Text"));
    expect(lastSettings(onChange)).toMatchObject({ wrap: false });
    expect(screen.queryByLabelText("Max Width")).toBeNull();
  });

  it("restores saved pipeline settings", () => {
    const onChange = vi.fn();
    render(
      <TextOverlayControls
        settings={{ text: "Saved", position: "custom", x: 10, y: 90, wrap: false, maxWidth: 40 }}
        onChange={onChange}
      />,
    );
    expect(lastSettings(onChange)).toMatchObject({
      text: "Saved",
      position: "custom",
      x: 10,
      y: 90,
      wrap: false,
      maxWidth: 40,
    });
  });
});
