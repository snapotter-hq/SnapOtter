// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadBlob } from "@/lib/download";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/**
 * Capture anchors the code under test clicks, without letting the click reach
 * jsdom's navigation path (which logs "Not implemented: navigation").
 */
function captureAnchorClicks(): HTMLAnchorElement[] {
  const clicked: HTMLAnchorElement[] = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
    const el = realCreate(tag);
    if (tag === "a") {
      vi.spyOn(el as HTMLAnchorElement, "click").mockImplementation(() => {
        clicked.push(el as HTMLAnchorElement);
      });
    }
    return el;
  });
  return clicked;
}

describe("downloadBlob", () => {
  it("clicks an anchor carrying the filename", () => {
    // Fake timers so the deferred revoke is discarded with the clock rather
    // than firing after afterEach has put the real URL global back.
    vi.useFakeTimers();
    const createObjectURL = vi.fn(() => "blob:fake");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL, revokeObjectURL });

    const clicked = captureAnchorClicks();

    downloadBlob(new Blob(["x"]), "out.zip");

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe("out.zip");
    expect(clicked[0].href).toContain("blob:fake");
  });

  it("revokes the object URL only after the current tick", () => {
    vi.useFakeTimers();
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL });

    captureAnchorClicks();

    downloadBlob(new Blob(["x"]), "out.zip");

    // Revoking in the same tick can cancel the download before it starts.
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
