// @vitest-environment jsdom
import { ANALYTICS_EVENTS } from "@snapotter/shared";
import { cleanup, fireEvent, render, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
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
import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { track } from "@/lib/analytics";
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
  window.history.replaceState({}, "", "/");
  useFileStore.getState().reset();
  vi.mocked(track).mockClear();
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

  it("claims claimEntryId when provided even if selectedIndex points at another entry (#2731)", () => {
    useFileStore.getState().setFiles([makeFile("a.png"), makeFile("b.png")]);
    const entryA = useFileStore.getState().entries[0];
    useFileStore.getState().updateEntryById(entryA.id, {
      processedUrl: "/api/v1/download/job-a/a.png",
      status: "completed",
    });
    useFileStore.getState().setSelectedIndex(1);
    const { container } = render(
      <ResultDownloadLink
        href="/api/v1/download/job-a/a.png"
        testId="convert-download"
        claimEntryId={entryA.id}
      />,
    );

    const routerWrapper = ({ children }: { children: ReactNode }) => (
      <MemoryRouter initialEntries={["/image/compose"]}>{children}</MemoryRouter>
    );
    expect(renderHook(() => useWorkInFlight(), { wrapper: routerWrapper }).result.current).toEqual({
      kind: "unsaved",
      downloads: [
        {
          kind: "result",
          index: 0,
          url: "/api/v1/download/job-a/a.png",
          filename: "a.png",
        },
      ],
    });

    fireEvent.click(container.querySelector("[data-testid='convert-download']") as HTMLElement);

    const { entries } = useFileStore.getState();
    expect(entries[0].claimed).toBe(true);
    expect(entries[1].claimed).toBe(false);
    expect(
      renderHook(() => useWorkInFlight(), { wrapper: routerWrapper }).result.current,
    ).toBeNull();
  });

  it("emits RESULT_DOWNLOADED from an explicit toolId prop (#3966)", () => {
    useFileStore.getState().setFiles([makeFile("a.pdf")]);
    const { container } = render(
      <ResultDownloadLink href="blob:result" toolId="sign-pdf" testId="sign-pdf-download" />,
    );

    fireEvent.click(container.querySelector("[data-testid='sign-pdf-download']") as HTMLElement);

    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.RESULT_DOWNLOADED, {
      tool_id: "sign-pdf",
    });
  });

  it("resolves tool_id from route params or location when no toolId prop is given (#3966)", () => {
    useFileStore.getState().setFiles([makeFile("a.png")]);
    const { container } = render(
      <MemoryRouter initialEntries={["/image/jpg-to-png"]}>
        <Routes>
          <Route
            path="/:section/:toolId"
            element={<ResultDownloadLink href="blob:result" testId="preset-download" />}
          />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.click(container.querySelector("[data-testid='preset-download']") as HTMLElement);

    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.RESULT_DOWNLOADED, {
      tool_id: "jpg-to-png",
    });
  });

  it("resolves tool_id from window.location.pathname when rendered outside a Router (#3966)", () => {
    window.history.replaceState({}, "", "/pdf/sign-pdf");
    useFileStore.getState().setFiles([makeFile("a.pdf")]);
    const { container } = render(<ResultDownloadLink href="blob:result" />);

    fireEvent.click(container.querySelector("a") as HTMLElement);

    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.RESULT_DOWNLOADED, {
      tool_id: "sign-pdf",
    });
  });
});
