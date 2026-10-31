// @vitest-environment jsdom
import { isSafeMessageError } from "@snapotter/shared";
import { afterEach, describe, expect, it, vi } from "vitest";

const toastError = vi.hoisted(() => vi.fn());
// sonner only resolves under apps/web, so a bare "sonner" here would register a
// different module id than the helper imports and silently mock nothing (#1235).
vi.mock("../../../apps/web/node_modules/sonner", () => ({ toast: { error: toastError } }));

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { captureHandledError } from "@/lib/analytics";
import { runEditorAction } from "@/lib/editor-action";

afterEach(() => {
  toastError.mockReset();
  vi.mocked(captureHandledError).mockClear();
  vi.restoreAllMocks();
});

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("runEditorAction (#2070)", () => {
  it("shows the failure message when the action rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runEditorAction(Promise.reject(new Error("tainted canvas")), "Something went wrong");
    await settle();
    expect(toastError).toHaveBeenCalledWith("Something went wrong");
  });

  it("logs and reports the underlying error, which a toast alone would lose", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const cause = new Error("tainted canvas");
    runEditorAction(Promise.reject(cause), "Something went wrong");
    await settle();

    expect(log).toHaveBeenCalledWith("Editor action failed", cause);
    expect(captureHandledError).toHaveBeenCalledTimes(1);
    const [reported] = vi.mocked(captureHandledError).mock.calls[0];
    expect(isSafeMessageError(reported)).toBe(true);
    expect(reported.cause).toBe(cause);
  });

  it("stays quiet when the action succeeds", async () => {
    runEditorAction(Promise.resolve(), "Something went wrong");
    await settle();
    expect(toastError).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();
  });
});
