// @vitest-environment jsdom
import type { FeatureBundleState } from "@snapotter/shared";
import { TOOLS } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ToolCard } from "@/components/common/tool-card";
import { useFeaturesStore } from "@/stores/features-store";
import { usePinnedToolsStore } from "@/stores/pinned-tools-store";

// Make the store's optimistic persistence a no-op so the test stays server-free.
vi.mock("@/lib/api", () => ({
  apiGet: vi.fn(() => Promise.resolve({ preferences: {} })),
  apiPut: vi.fn(() => Promise.resolve({ ok: true })),
}));

const resize = TOOLS.find((tool) => tool.id === "resize");
if (!resize) throw new Error("resize tool missing from TOOLS");
const passportPhoto = TOOLS.find((tool) => tool.id === "passport-photo");
if (!passportPhoto) throw new Error("passport-photo tool missing from TOOLS");

function makeBundleState(overrides: Partial<FeatureBundleState> = {}): FeatureBundleState {
  return {
    id: "background-removal",
    name: "Background Removal",
    description: "Remove backgrounds",
    status: "not_installed",
    installedVersion: null,
    estimatedSize: "4-5 GB",
    enablesTools: ["remove-background", "passport-photo"],
    progress: null,
    error: null,
    ...overrides,
  };
}

afterEach(cleanup);

beforeEach(() => {
  usePinnedToolsStore.setState({
    pinnedTools: [],
    lastConfirmed: [],
    loaded: true,
    loadError: false,
  });
  useFeaturesStore.setState({
    bundles: [],
    loaded: true,
    loadError: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
  });
});

function renderCard(showPin: boolean) {
  return render(
    <MemoryRouter>
      <ToolCard tool={resize} variant="descriptive" showPin={showPin} />
    </MemoryRouter>,
  );
}

describe("ToolCard pin button", () => {
  it("renders no pin button unless showPin is set", () => {
    renderCard(false);
    expect(screen.queryByTestId("pin-toggle-resize")).toBeNull();
  });

  it("toggles pinned state and aria label when clicked", () => {
    renderCard(true);
    const btn = screen.getByTestId("pin-toggle-resize");
    expect(btn.getAttribute("aria-label")).toBe("Pin");
    expect(btn.getAttribute("aria-pressed")).toBe("false");

    fireEvent.click(btn);
    expect(usePinnedToolsStore.getState().pinnedTools).toEqual(["resize"]);
    const pinnedBtn = screen.getByTestId("pin-toggle-resize");
    expect(pinnedBtn.getAttribute("aria-label")).toBe("Unpin");
    expect(pinnedBtn.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(pinnedBtn);
    expect(usePinnedToolsStore.getState().pinnedTools).toEqual([]);
  });
});

describe("ToolCard AI bundle status", () => {
  it("treats multi-bundle tools as not installed when an extra bundle is missing", () => {
    useFeaturesStore.setState({
      bundles: [
        makeBundleState({ id: "background-removal", status: "installed" }),
        makeBundleState({
          id: "face-detection",
          name: "Face Detection",
          status: "not_installed",
          enablesTools: ["blur-faces", "red-eye-removal", "smart-crop"],
        }),
      ],
    });

    const { container } = render(
      <MemoryRouter>
        <ToolCard tool={passportPhoto} variant="descriptive" />
      </MemoryRouter>,
    );

    // One SVG is the tool icon, the second is the missing-AI-bundle indicator.
    expect(container.querySelectorAll("svg")).toHaveLength(2);
  });
});
