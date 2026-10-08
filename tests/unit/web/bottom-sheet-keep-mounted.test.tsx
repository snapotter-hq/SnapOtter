// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomSheet } from "@/components/common/bottom-sheet";

afterEach(cleanup);

/**
 * #1974: the mobile tool page keeps a run's state (its request, progress
 * stream and timers) in the settings panel, and the sheet used to unmount that
 * panel whenever it closed. These pin a sheet that can stay mounted while shut.
 */

const lifecycle = { mounted: vi.fn(), unmounted: vi.fn() };

function Panel() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    lifecycle.mounted();
    return () => lifecycle.unmounted();
  }, []);
  return (
    <button type="button" onClick={() => setCount((c) => c + 1)}>
      clicks {count}
    </button>
  );
}

function Harness({ keepMounted }: { keepMounted?: boolean }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button type="button" onClick={() => setOpen((o) => !o)}>
        toggle
      </button>
      <BottomSheet
        open={open}
        onClose={() => setOpen(false)}
        title="Settings"
        keepMounted={keepMounted}
      >
        <Panel />
      </BottomSheet>
    </>
  );
}

describe("BottomSheet keepMounted (#1974)", () => {
  it("unmounts its children when closed by default, as before", () => {
    lifecycle.mounted.mockClear();
    lifecycle.unmounted.mockClear();
    render(<Harness />);

    fireEvent.click(screen.getByText("toggle"));

    expect(screen.queryByText(/clicks/)).not.toBeInTheDocument();
    expect(lifecycle.unmounted).toHaveBeenCalledTimes(1);
  });

  it("keeps its children mounted, with their state, while closed", () => {
    lifecycle.mounted.mockClear();
    lifecycle.unmounted.mockClear();
    render(<Harness keepMounted />);
    fireEvent.click(screen.getByText("clicks 0"));

    fireEvent.click(screen.getByText("toggle"));
    fireEvent.click(screen.getByText("toggle"));

    expect(screen.getByText("clicks 1")).toBeInTheDocument();
    expect(lifecycle.mounted).toHaveBeenCalledTimes(1);
    expect(lifecycle.unmounted).not.toHaveBeenCalled();
  });

  it("hides the closed sheet from sight and from assistive tech", () => {
    render(<Harness keepMounted />);
    expect(screen.getByRole("dialog")).toBeVisible();

    fireEvent.click(screen.getByText("toggle"));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("clicks 0", { selector: "button" })).not.toBeVisible();
  });

  it("shows no backdrop while closed and closes from it when open", () => {
    const { container } = render(<Harness keepMounted />);
    const backdrop = () => container.querySelector("[aria-hidden='true'].fixed");
    expect(backdrop()).not.toBeNull();

    act(() => {
      fireEvent.click(backdrop() as Element);
    });

    expect(backdrop()).toBeNull();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("ignores Escape while closed", () => {
    const onClose = vi.fn();
    render(
      <BottomSheet open={false} onClose={onClose} keepMounted>
        <Panel />
      </BottomSheet>,
    );

    fireEvent.keyDown(window, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });
});
