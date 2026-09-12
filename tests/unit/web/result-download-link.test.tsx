// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const imagePreviewMock = vi.hoisted(() => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
}));

vi.mock("@/lib/image-preview", () => imagePreviewMock);

vi.mock("@/lib/analytics", () => ({
  track: vi.fn(),
  // formatHeaders() in @/lib/api reads this; without it unrelated code throws
  // and the failure is swallowed.
  getDistinctId: () => null,
}));

import { ResultDownloadLink } from "@/components/common/result-download-link";
import { useFileStore } from "@/stores/file-store";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

/** jsdom has no navigation, so let the click run but drop the default action. */
function swallowNavigation(e: Event) {
  e.preventDefault();
}

beforeEach(() => {
  vi.stubGlobal("URL", {
    ...URL,
    createObjectURL: () => "blob:fake",
    revokeObjectURL: () => {},
  });
  document.addEventListener("click", swallowNavigation, true);
  useFileStore.getState().reset();
});

afterEach(() => {
  document.removeEventListener("click", swallowNavigation, true);
  cleanup();
  vi.unstubAllGlobals();
});

describe("ResultDownloadLink", () => {
  it("renders a download anchor carrying the href and the test id", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const { container } = render(
      <ResultDownloadLink href="blob:result" testId="convert-download" />,
    );

    const link = container.querySelector<HTMLAnchorElement>("[data-testid='convert-download']");
    expect(link).not.toBeNull();
    expect(link?.tagName).toBe("A");
    expect(link?.getAttribute("href")).toBe("blob:result");
    expect(link?.hasAttribute("download")).toBe(true);
  });

  it("forces the saved filename when one is given", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const { container } = render(
      <ResultDownloadLink
        href="blob:result"
        testId="favicon-download"
        downloadName="favicons.zip"
      />,
    );

    const link = container.querySelector<HTMLAnchorElement>("[data-testid='favicon-download']");
    expect(link?.getAttribute("download")).toBe("favicons.zip");
  });

  it("keeps the icon when only the label is replaced", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const { container } = render(
      <ResultDownloadLink href="blob:result" testId="vectorize-download" label="Download SVG" />,
    );

    const link = container.querySelector<HTMLAnchorElement>("[data-testid='vectorize-download']");
    expect(link?.textContent).toContain("Download SVG");
    expect(link?.querySelector("svg")).not.toBeNull();
  });

  it("claims the entry when the result is downloaded", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const { container } = render(
      <ResultDownloadLink href="blob:result" testId="convert-download" />,
    );
    expect(useFileStore.getState().entries[0].claimed).toBe(false);

    fireEvent.click(container.querySelector("[data-testid='convert-download']") as HTMLElement);

    expect(useFileStore.getState().entries[0].claimed).toBe(true);
  });

  it("claims the selected entry, not the first one", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    useFileStore.getState().setSelectedIndex(1);
    const { container } = render(
      <ResultDownloadLink href="blob:result" testId="convert-download" />,
    );

    fireEvent.click(container.querySelector("[data-testid='convert-download']") as HTMLElement);

    const { entries } = useFileStore.getState();
    expect(entries[1].claimed).toBe(true);
    expect(entries[0].claimed).toBe(false);
  });
});
