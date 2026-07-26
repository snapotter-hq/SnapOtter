// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpDialog } from "@/components/help/help-dialog";

/**
 * The help dialog once carried its shortcut labels and its getting-started copy
 * as hardcoded English, while fully translated strings for exactly those labels
 * sat unused in all 21 locale files. No test caught it, because the i18n context
 * defaults to `en`: asserting on English text passes either way.
 *
 * So this mocks the context with sentinel values instead. Any label that goes
 * back to hardcoded English stops rendering its sentinel and fails here.
 */
const SHORTCUT_KEYS = [
  "focusSearchBar",
  "typeToSearch",
  "goToTools",
  "processFile",
  "downloadResult",
  "toggleTheme",
  "goToResize",
  "goToCrop",
  "goToCompress",
  "goToConvert",
  "goToRemoveBackground",
  "goToWatermarkText",
  "goToStripMetadata",
  "goToImageInfo",
] as const;

vi.mock("@/contexts/i18n-context", () => ({
  useTranslation: () => ({
    locale: "xx",
    setLocale: () => {},
    t: {
      a11y: { closeHelp: "SENTINEL_closeHelp" },
      help: {
        heading: "SENTINEL_heading",
        gettingStarted: {
          heading: "SENTINEL_gettingStartedHeading",
          description: "SENTINEL_gettingStartedDescription",
        },
        keyboardShortcuts: {
          heading: "SENTINEL_shortcutsHeading",
          focusSearchBar: "SENTINEL_focusSearchBar",
          typeToSearch: "SENTINEL_typeToSearch",
          goToTools: "SENTINEL_goToTools",
          processFile: "SENTINEL_processFile",
          downloadResult: "SENTINEL_downloadResult",
          toggleTheme: "SENTINEL_toggleTheme",
          goToResize: "SENTINEL_goToResize",
          goToCrop: "SENTINEL_goToCrop",
          goToCompress: "SENTINEL_goToCompress",
          goToConvert: "SENTINEL_goToConvert",
          goToRemoveBackground: "SENTINEL_goToRemoveBackground",
          goToWatermarkText: "SENTINEL_goToWatermarkText",
          goToStripMetadata: "SENTINEL_goToStripMetadata",
          goToImageInfo: "SENTINEL_goToImageInfo",
        },
        resources: {
          heading: "SENTINEL_resourcesHeading",
          githubLink: "SENTINEL_githubLink",
          reportIssueLink: "SENTINEL_reportIssueLink",
          docsLink: "SENTINEL_docsLink",
          apiRefLink: "SENTINEL_apiRefLink",
        },
        versionLabel: "SENTINEL_version {version}",
      },
    },
  }),
}));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("HelpDialog i18n wiring", () => {
  it.each(SHORTCUT_KEYS)("renders the translated label for %s", (key) => {
    render(<HelpDialog open={true} onClose={() => {}} />);

    expect(screen.getByText(`SENTINEL_${key}`)).toBeDefined();
  });

  it("renders the translated getting-started copy", () => {
    render(<HelpDialog open={true} onClose={() => {}} />);

    expect(screen.getByText("SENTINEL_gettingStartedDescription")).toBeDefined();
  });

  it("renders the version through the translated label, not a hardcoded prefix", () => {
    render(<HelpDialog open={true} onClose={() => {}} />);

    expect(screen.getByText(/^SENTINEL_version /)).toBeDefined();
  });

  it("renders the translated section headings and close label", () => {
    render(<HelpDialog open={true} onClose={() => {}} />);

    expect(screen.getByText("SENTINEL_heading")).toBeDefined();
    expect(screen.getByText("SENTINEL_shortcutsHeading")).toBeDefined();
    expect(screen.getByText("SENTINEL_resourcesHeading")).toBeDefined();
    expect(screen.getByLabelText("SENTINEL_closeHelp")).toBeDefined();
  });

  it("renders one row per shortcut and no others", () => {
    render(<HelpDialog open={true} onClose={() => {}} />);

    const rendered = SHORTCUT_KEYS.filter((k) => screen.queryByText(`SENTINEL_${k}`) !== null);
    expect(rendered).toHaveLength(SHORTCUT_KEYS.length);
  });

  it("renders nothing when closed", () => {
    const { container } = render(<HelpDialog open={false} onClose={() => {}} />);

    expect(container.firstChild).toBeNull();
  });
});
