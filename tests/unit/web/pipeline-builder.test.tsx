// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/tools/pipeline-step-settings", () => ({
  PipelineStepSettings: () => <div data-testid="step-settings" />,
}));

import { PipelineBuilder } from "@/components/tools/pipeline-builder";
import type { PipelineStep } from "@/stores/pipeline-store";

const STEPS: PipelineStep[] = [
  { id: "step-1", toolId: "resize", settings: { width: 800, height: 600 } },
  { id: "step-2", toolId: "compress", settings: { quality: 80 } },
];

function mockStepRects(handles: HTMLElement[]) {
  handles.forEach((handle, i) => {
    const row = handle.closest(".rounded-lg") as HTMLElement;
    const top = i * 70;
    const left = 0;
    const width = 400;
    const height = 56;
    vi.spyOn(row, "getBoundingClientRect").mockReturnValue({
      x: left,
      y: top,
      left,
      top,
      right: left + width,
      bottom: top + height,
      width,
      height,
      toJSON: () => ({}),
    });
  });
}

describe("PipelineBuilder touch and mouse step reordering (#2596)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    cleanup();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reorders steps on a touch press-and-hold even when the browser fires pointerdown and pointercancel", async () => {
    const onReorderSteps = vi.fn();
    const { container } = render(
      <PipelineBuilder
        steps={STEPS}
        expandedStepId={null}
        onRemoveStep={() => {}}
        onReorderSteps={onReorderSteps}
        onUpdateSettings={() => {}}
        onToggleStep={() => {}}
      />,
    );

    const handles = Array.from(
      container.querySelectorAll('span[aria-roledescription="sortable"]'),
    ) as HTMLElement[];
    expect(handles).toHaveLength(2);
    mockStepRects(handles);
    const handle0 = handles[0];

    act(() => {
      fireEvent.pointerDown(handle0, {
        pointerId: 1,
        pointerType: "touch",
        isPrimary: true,
        button: 0,
        clientX: 20,
        clientY: 20,
      });
      fireEvent.touchStart(handle0, {
        touches: [{ identifier: 0, clientX: 20, clientY: 20 }],
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
    });

    act(() => {
      fireEvent.pointerCancel(handle0, { pointerId: 1, pointerType: "touch", isPrimary: true });
      fireEvent.touchMove(handle0, {
        touches: [{ identifier: 0, clientX: 20, clientY: 95 }],
      });
    });

    await act(async () => {
      fireEvent.touchEnd(handle0, {
        changedTouches: [{ identifier: 0, clientX: 20, clientY: 95 }],
      });
    });

    await waitFor(() => {
      expect(onReorderSteps).toHaveBeenCalledWith("step-1", "step-2");
    });
    expect(handle0.className).toContain("select-none");
    expect(handle0.className).toContain("[-webkit-touch-callout:none]");
  });

  it("cancels touch drag on an immediate swipe so scrolling does not reorder steps", async () => {
    const onReorderSteps = vi.fn();
    const { container } = render(
      <PipelineBuilder
        steps={STEPS}
        expandedStepId={null}
        onRemoveStep={() => {}}
        onReorderSteps={onReorderSteps}
        onUpdateSettings={() => {}}
        onToggleStep={() => {}}
      />,
    );

    const handles = Array.from(
      container.querySelectorAll('span[aria-roledescription="sortable"]'),
    ) as HTMLElement[];
    mockStepRects(handles);
    const handle0 = handles[0];

    act(() => {
      fireEvent.touchStart(handle0, {
        touches: [{ identifier: 0, clientX: 20, clientY: 20 }],
      });
      fireEvent.touchMove(handle0, {
        touches: [{ identifier: 0, clientX: 20, clientY: 70 }],
      });
    });

    await act(async () => {
      vi.advanceTimersByTime(250);
      fireEvent.touchMove(handle0, {
        touches: [{ identifier: 0, clientX: 20, clientY: 95 }],
      });
      fireEvent.touchEnd(handle0, {
        changedTouches: [{ identifier: 0, clientX: 20, clientY: 95 }],
      });
    });

    expect(onReorderSteps).not.toHaveBeenCalled();
  });

  it("reorders steps on a desktop mouse drag without toggling step expansion", async () => {
    const onReorderSteps = vi.fn();
    const onToggleStep = vi.fn();
    const { container } = render(
      <PipelineBuilder
        steps={STEPS}
        expandedStepId={null}
        onRemoveStep={() => {}}
        onReorderSteps={onReorderSteps}
        onUpdateSettings={() => {}}
        onToggleStep={onToggleStep}
      />,
    );

    const handles = Array.from(
      container.querySelectorAll('span[aria-roledescription="sortable"]'),
    ) as HTMLElement[];
    mockStepRects(handles);
    const handle0 = handles[0];

    act(() => {
      fireEvent.mouseDown(handle0, { button: 0, clientX: 20, clientY: 20 });
      fireEvent.mouseMove(document, { clientX: 20, clientY: 30 });
    });

    act(() => {
      fireEvent.mouseMove(document, { clientX: 20, clientY: 95 });
    });

    await act(async () => {
      fireEvent.mouseUp(document, { clientX: 20, clientY: 95 });
    });

    await waitFor(() => {
      expect(onReorderSteps).toHaveBeenCalledWith("step-1", "step-2");
    });
    expect(onToggleStep).not.toHaveBeenCalled();
    expect(screen.getByText("Resize Image")).toBeInTheDocument();
  });

  it("renders the empty state when no steps are present and toggles or removes steps on click", () => {
    const onRemoveStep = vi.fn();
    const onToggleStep = vi.fn();
    const { rerender } = render(
      <PipelineBuilder
        steps={[]}
        expandedStepId={null}
        onRemoveStep={onRemoveStep}
        onReorderSteps={() => {}}
        onUpdateSettings={() => {}}
        onToggleStep={onToggleStep}
      />,
    );

    expect(screen.getByRole("heading", { name: /no steps/i })).toBeInTheDocument();

    rerender(
      <PipelineBuilder
        steps={STEPS}
        expandedStepId="step-1"
        onRemoveStep={onRemoveStep}
        onReorderSteps={() => {}}
        onUpdateSettings={() => {}}
        onToggleStep={onToggleStep}
      />,
    );

    fireEvent.click(screen.getByText("Resize Image"));
    expect(onToggleStep).toHaveBeenCalledWith(null);

    fireEvent.click(screen.getAllByTitle("Remove")[1]);
    expect(onRemoveStep).toHaveBeenCalledWith("step-2");
  });

  it("reorders steps via keyboard on the grip handle without toggling step expansion", async () => {
    const onReorderSteps = vi.fn();
    const onToggleStep = vi.fn();
    const { container } = render(
      <PipelineBuilder
        steps={STEPS}
        expandedStepId={null}
        onRemoveStep={() => {}}
        onReorderSteps={onReorderSteps}
        onUpdateSettings={() => {}}
        onToggleStep={onToggleStep}
      />,
    );

    const handles = Array.from(
      container.querySelectorAll('span[aria-roledescription="sortable"]'),
    ) as HTMLElement[];
    mockStepRects(handles);
    const handle0 = handles[0];

    act(() => {
      fireEvent.keyDown(handle0, { key: " ", code: "Space" });
    });
    await act(async () => {
      vi.advanceTimersByTime(10);
    });
    act(() => {
      fireEvent.keyDown(document, { key: "ArrowDown", code: "ArrowDown" });
    });
    await act(async () => {
      fireEvent.keyDown(document, { key: " ", code: "Space" });
    });

    await waitFor(() => {
      expect(onReorderSteps).toHaveBeenCalledWith("step-1", "step-2");
    });
    expect(onToggleStep).not.toHaveBeenCalled();
  });
});
