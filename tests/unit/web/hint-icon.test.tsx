// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { HintIcon } from "@/components/common/hint-icon";

afterEach(cleanup);

describe("HintIcon", () => {
  // The tooltip carries group-hover:opacity-100 (a substring hit for
  // "opacity-100") at all times, so visibility checks must be token-level.
  const isOpen = (el: HTMLElement) => el.classList.contains("opacity-100");

  it("hides the tooltip until interaction", () => {
    render(<HintIcon text="Sharper edges cost more CPU" />);
    const tip = screen.getByText("Sharper edges cost more CPU");
    expect(tip.classList.contains("opacity-0")).toBe(true);
    expect(isOpen(tip)).toBe(false);
  });

  it("tap toggles the tooltip (iOS Safari never focuses buttons on tap)", () => {
    render(<HintIcon text="hint" />);
    const trigger = screen.getByRole("button", { name: "hint" });

    fireEvent.click(trigger);
    expect(isOpen(screen.getByText("hint", { selector: "span" }))).toBe(true);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");

    fireEvent.click(trigger);
    expect(isOpen(screen.getByText("hint", { selector: "span" }))).toBe(false);
  });

  it("closes on blur", () => {
    render(<HintIcon text="hint" />);
    const trigger = screen.getByRole("button", { name: "hint" });
    fireEvent.click(trigger);
    fireEvent.blur(trigger);
    expect(isOpen(screen.getByText("hint", { selector: "span" }))).toBe(false);
  });

  // iOS Safari never focuses (or blurs) buttons on tap, so outside-tap and
  // Escape are the dismissal paths that actually exist on touch devices.
  it("closes on pointerdown outside", () => {
    render(<HintIcon text="hint" />);
    fireEvent.click(screen.getByRole("button", { name: "hint" }));
    fireEvent.pointerDown(document.body);
    expect(isOpen(screen.getByText("hint", { selector: "span" }))).toBe(false);
  });

  it("stays open on pointerdown on the trigger itself", () => {
    render(<HintIcon text="hint" />);
    const trigger = screen.getByRole("button", { name: "hint" });
    fireEvent.click(trigger);
    fireEvent.pointerDown(trigger);
    expect(isOpen(screen.getByText("hint", { selector: "span" }))).toBe(true);
  });

  it("closes on Escape", () => {
    render(<HintIcon text="hint" />);
    fireEvent.click(screen.getByRole("button", { name: "hint" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(isOpen(screen.getByText("hint", { selector: "span" }))).toBe(false);
  });
});
