// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// AiFeaturesSection polls disk usage on mount; keep it off the network.
vi.mock("@/lib/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api")>()),
  apiGet: vi.fn(async () => ({ totalBytes: 0 })),
}));

import { AiFeaturesSection } from "@/components/settings/ai-features-section";
import { I18nProvider } from "@/contexts/i18n-context";
import { useFeaturesStore } from "@/stores/features-store";

beforeEach(() => {
  useFeaturesStore.setState({
    bundles: [],
    loaded: true,
    loadError: false,
    bundlesStale: false,
    installing: {},
    errors: {},
    queued: [],
    installAllActive: false,
    startTimes: {},
    fetch: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
});

describe("AiFeaturesSection stale notice (#1138)", () => {
  it("shows the stale notice when background refreshes keep failing", () => {
    useFeaturesStore.setState({ bundlesStale: true });
    render(
      <I18nProvider>
        <AiFeaturesSection />
      </I18nProvider>,
    );

    expect(screen.getByRole("status")).toHaveTextContent(en.settings.aiFeatures.statusStale);
  });

  it("shows no notice while the list is current", () => {
    render(
      <I18nProvider>
        <AiFeaturesSection />
      </I18nProvider>,
    );

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
