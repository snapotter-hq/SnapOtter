// @vitest-environment jsdom
import { en } from "@snapotter/shared";
import { act, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The toast is sonner's; what matters here is when it is shown and with what text.
const showIgnored = vi.hoisted(() => vi.fn());
vi.mock("@/lib/intake-notice", () => ({ showIntakeIgnored: showIgnored }));

import { useIntakeGuard } from "@/hooks/use-intake-guard";
import { useFileStore } from "@/stores/file-store";
import { usePassportPhotoStore } from "@/stores/passport-photo-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";
import { useSplitStore } from "@/stores/split-store";

/**
 * #2108: a file dropped or pasted onto a tool page replaces the loaded one. A
 * run in flight either stops once its file leaves the store (#1894, #1975) or
 * lands its result under the new file, and neither said a word. The guard turns
 * the intake away and says why, for every tool the leave guard counts as busy.
 */

function renderGuard(path = "/image/resize") {
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
  );
  return renderHook(() => useIntakeGuard(), { wrapper });
}

beforeEach(() => {
  showIgnored.mockClear();
  useFileStore.getState().reset();
});

afterEach(() => {
  useFileStore.getState().reset();
  useSplitStore.setState({ processing: false });
  usePdfToImageStore.setState({ processing: false });
  usePassportPhotoStore.setState({ analyzing: false, generating: false });
});

describe("useIntakeGuard (#2108)", () => {
  it("lets files in when nothing is running, without a word", () => {
    const { result } = renderGuard();

    expect(result.current.running).toBe(false);
    expect(result.current.allowIntake()).toBe(true);
    expect(showIgnored).not.toHaveBeenCalled();
  });

  it("turns files away while a run is in flight, and says why", () => {
    useFileStore.getState().setProcessing(true);
    const { result } = renderGuard();

    expect(result.current.running).toBe(true);
    expect(result.current.allowIntake()).toBe(false);

    expect(showIgnored).toHaveBeenCalledTimes(1);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
  });

  it("follows the run as it starts and ends", () => {
    const { result } = renderGuard();
    expect(result.current.allowIntake()).toBe(true);

    act(() => {
      useFileStore.getState().setProcessing(true);
    });
    expect(result.current.allowIntake()).toBe(false);

    act(() => {
      useFileStore.getState().setProcessing(false);
    });
    expect(result.current.allowIntake()).toBe(true);
  });

  // These keep their runs in a store of their own, and a drop used to replace the
  // file under them with no sign: split and pdf-to-image landed the old file's
  // result under the new one, and passport photo cleared an analysis mid-flight.
  it.each([
    ["split", "/image/split", () => useSplitStore.setState({ processing: true })],
    ["pdf-to-image", "/pdf/pdf-to-image", () => usePdfToImageStore.setState({ processing: true })],
    [
      "passport-photo (analysing)",
      "/image/passport-photo",
      () => usePassportPhotoStore.setState({ analyzing: true }),
    ],
    [
      "passport-photo (generating)",
      "/image/passport-photo",
      () => usePassportPhotoStore.setState({ generating: true }),
    ],
  ])("turns files away while %s is busy in its own store", (_name, path, start) => {
    start();
    const { result } = renderGuard(path);

    expect(result.current.allowIntake()).toBe(false);
    expect(showIgnored).toHaveBeenCalledWith(en.dropzone.ignoredWhileRunning);
  });

  it("does not count another tool's busy store against this page", () => {
    useSplitStore.setState({ processing: true });
    const { result } = renderGuard("/image/resize");

    expect(result.current.allowIntake()).toBe(true);
    expect(showIgnored).not.toHaveBeenCalled();
  });
});
