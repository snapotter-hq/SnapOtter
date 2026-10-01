// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureHandledError = vi.hoisted(() => vi.fn(() => Promise.resolve(null)));
vi.mock("@/lib/analytics", () => ({ captureHandledError }));

import { ProgressCard } from "@/components/common/progress-card";
import { useFileStore } from "@/stores/file-store";

function renderCard() {
  return render(
    <ProgressCard active phase="processing" label="Processing" percent={40} elapsed={3} />,
  );
}

const cancelButton = () => screen.getByRole("button", { name: /cancel/i });

const unhandled: unknown[] = [];
const onUnhandled = (reason: unknown) => {
  unhandled.push(reason);
};

beforeEach(() => {
  useFileStore.getState().reset();
  unhandled.length = 0;
  process.on("unhandledRejection", onUnhandled);
});

afterEach(() => {
  process.off("unhandledRejection", onUnhandled);
  cleanup();
  vi.restoreAllMocks();
  captureHandledError.mockClear();
  useFileStore.getState().reset();
});

/**
 * #1779: the run hooks reject a cancel whose own teardown threw instead of
 * swallowing it. The cancel button is the caller, so it has to take that
 * rejection: report it, keep it off the unhandled-rejection path, and give
 * the button back so the user can try again.
 */
describe("ProgressCard cancel (#1779)", () => {
  it("reports a cancel that rejects and re-enables the button", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    const failure = new Error("teardown broke");
    const cancel = vi.fn(() => Promise.reject(failure));
    useFileStore.getState().setActiveJob("job-1", cancel);
    renderCard();

    fireEvent.click(cancelButton());

    await waitFor(() => expect(captureHandledError).toHaveBeenCalledTimes(1));
    expect(cancel).toHaveBeenCalledTimes(1);
    const [report, tags] = captureHandledError.mock.calls[0] as unknown as [
      Error & { isSafeMessage?: boolean; kind?: string },
      Record<string, string>,
    ];
    expect(report.message).toBe("Canceling the run failed");
    expect(report.isSafeMessage).toBe(true);
    expect(report.kind).toBe("bug");
    expect(report.cause).toBe(failure);
    expect(tags).toEqual({ error_class: "bug" });
    expect(consoleError).toHaveBeenCalledWith("Canceling the run failed", failure);
    await waitFor(() => expect(cancelButton()).toBeEnabled());

    // Let any stray rejection surface before checking none escaped.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(unhandled).toEqual([]);
  });

  it("reports nothing when the cancel resolves", async () => {
    const cancel = vi.fn(() => Promise.resolve());
    useFileStore.getState().setActiveJob("job-1", cancel);
    renderCard();

    fireEvent.click(cancelButton());

    await waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(cancelButton()).toBeEnabled());
    expect(captureHandledError).not.toHaveBeenCalled();
  });

  it("disables the button while the cancel is in flight", async () => {
    let finish: () => void = () => {};
    const cancel = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve;
        }),
    );
    useFileStore.getState().setActiveJob("job-1", cancel);
    renderCard();

    fireEvent.click(cancelButton());

    await waitFor(() => expect(cancelButton()).toBeDisabled());
    finish();
    await waitFor(() => expect(cancelButton()).toBeEnabled());
  });
});
