// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { de } from "@snapotter/shared/i18n/de.js";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Locale-sentinel coverage for the #909 sweep. Asserting on English would pass
 * whether or not a component reads i18n (the provider defaults to en), so every
 * assertion here is against the German bundle and each case also asserts the old
 * English literal is gone.
 */

const storage = vi.hoisted(() => new Map<string, string>());
const apiGet = vi.hoisted(() => vi.fn());
vi.stubGlobal("localStorage", {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
  clear: () => storage.clear(),
});

vi.mock("@/lib/api", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, apiGet };
});

vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({
    permissions: [],
    hasPermission: () => true,
    authEnabled: true,
    role: "admin",
  }),
}));

import { BeforeAfterSlider } from "@/components/common/before-after-slider";
import { MetadataGrid } from "@/components/common/metadata-grid";
import { AutosaveRecoveryBanner } from "@/components/editor/common/export-dialog";
import { BrushOptions } from "@/components/editor/options/brush-options";
import { FileListItem } from "@/components/files/file-list-item";
import { ApiKeysSection, AuditLogSection } from "@/components/settings/settings-dialog";
import { I18nProvider } from "@/contexts/i18n-context";
import { format, formatDate, formatDateTime } from "@/lib/format";
import { PrivacyPolicyPage } from "@/pages/privacy-policy-page";
import { useEditorStore } from "@/stores/editor-store";

function renderDe(ui: React.ReactNode) {
  localStorage.setItem("snapotter-locale", "de");
  return render(<I18nProvider>{ui}</I18nProvider>);
}

beforeEach(() => {
  storage.clear();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("web-wide i18n sweep (#909)", () => {
  it("localizes the before/after size summary, placeholders included", async () => {
    renderDe(
      <BeforeAfterSlider
        beforeSrc="blob:before"
        afterSrc="blob:after"
        beforeSize={2000}
        afterSize={1000}
      />,
    );

    // "Verarbeitet", not "Processed": German for both the alt text and the
    // composed size sentence, so the assertion fails if either is hardcoded.
    const contains = (needle: string) => (_: string, el: Element | null) =>
      el?.textContent?.includes(needle) ?? false;
    const processedLabel = de.comparison.processedSize.split("{size}")[0].trim();
    const smallerTail = de.comparison.smallerBadge.split("{percent}")[1];

    expect(await screen.findByAltText(de.comparison.processed)).toBeInTheDocument();
    expect(screen.getAllByText(contains(processedLabel)).length).toBeGreaterThan(0);
    expect(screen.getAllByText(contains(smallerTail)).length).toBeGreaterThan(0);
    expect(screen.queryByAltText("Processed")).not.toBeInTheDocument();
    // queryAllByText, not queryByText: a function matcher also matches every
    // ancestor, so a reintroduced literal would throw "found multiple" rather
    // than fail the assertion.
    expect(screen.queryAllByText(contains("smaller"))).toHaveLength(0);
    // The composed sentence must substitute, not render any raw placeholder.
    expect(screen.queryAllByText(contains("{size}"))).toHaveLength(0);
  });

  it("localizes the metadata grid empty state", async () => {
    renderDe(<MetadataGrid data={{}} />);

    expect(await screen.findByText(de.commonUi.metadataGrid.noData)).toBeInTheDocument();
    expect(screen.queryByText("No data")).not.toBeInTheDocument();
  });

  it("localizes an editor options bar", async () => {
    useEditorStore.setState({ activeTool: "brush" });
    renderDe(<BrushOptions />);

    expect(await screen.findByText(de.editor.options.shared.size)).toBeInTheDocument();
    expect(screen.getByText(de.editor.shapes.opacity)).toBeInTheDocument();
    expect(screen.getByText(de.editor.options.shared.hardness)).toBeInTheDocument();
    expect(screen.queryByText("Hardness")).not.toBeInTheDocument();
  });

  it("localizes the privacy policy prose and keeps the inline code tokens literal", async () => {
    renderDe(
      <MemoryRouter>
        <PrivacyPolicyPage />
      </MemoryRouter>,
    );

    expect(await screen.findByText(de.privacyPolicy.overview.heading)).toBeInTheDocument();
    expect(screen.getByText(de.privacyPolicy.overview.body)).toBeInTheDocument();
    expect(screen.getByText(de.privacyPolicy.yourControl.body)).toBeInTheDocument();
    expect(screen.queryByText(/self-hosted, open-source file processing/)).not.toBeInTheDocument();

    // Identifiers stay untranslated, and no placeholder of any name survives
    // into the DOM (a locale that renamed one would still be caught).
    expect(screen.getByText("SNAPOTTER_ANALYTICS=off")).toBeInTheDocument();
    expect(screen.getByText("feedback_submitted")).toBeInTheDocument();
    const anyPlaceholder = (_: string, el: Element | null) =>
      /\{[a-z]+\}/i.test(el?.textContent ?? "");
    expect(screen.queryAllByText(anyPlaceholder)).toHaveLength(0);
  });
});

describe("date formatting in app locale (#924)", () => {
  const CREATED_ISO = "2026-08-27T14:30:00Z";
  const EXPIRES_ISO = "2026-09-15T14:30:00Z";

  it("formats API key createdAt and expiresAt dates in the active app locale", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path === "/v1/api-keys") {
        return {
          apiKeys: [
            {
              id: 1,
              name: "deploy-key",
              prefix: "si_abc",
              createdAt: CREATED_ISO,
              permissions: null,
              expiresAt: EXPIRES_ISO,
            },
          ],
        };
      }
      return {};
    });

    renderDe(<ApiKeysSection />);

    const expectedCreated = format(de.settings.apiKeys.createdPrefix, {
      date: formatDate(CREATED_ISO, "de"),
    });
    const expectedExpires = format(de.settings.apiKeys.expiresPrefix, {
      date: formatDate(EXPIRES_ISO, "de"),
    });

    expect(await screen.findByText(expectedExpires)).toBeInTheDocument();
    expect(screen.getByText("deploy-key")).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.textContent?.includes(expectedCreated) ?? false, {
        selector: "p",
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        (_, el) =>
          el?.textContent?.includes(new Date(CREATED_ISO).toLocaleDateString("en-US")) ?? false,
      ),
    ).not.toBeInTheDocument();
  });

  it("formats audit log timestamps older than 7 days in the active app locale across desktop and mobile", async () => {
    apiGet.mockImplementation(async (path: string) => {
      if (path.startsWith("/v1/audit-log")) {
        return {
          entries: [
            {
              id: "audit-1",
              actorId: "u1",
              actorUsername: "ada",
              action: "LOGIN_SUCCESS",
              targetType: null,
              targetId: null,
              details: null,
              ipAddress: "127.0.0.1",
              requestId: null,
              createdAt: CREATED_ISO,
            },
          ],
          total: 1,
        };
      }
      return {};
    });

    const { unmount } = renderDe(<AuditLogSection />);

    expect(await screen.findByText(de.settings.auditLog.heading)).toBeInTheDocument();
    expect(await screen.findByText(formatDate(CREATED_ISO, "de"))).toBeInTheDocument();
    expect(
      screen.queryByText(new Date(CREATED_ISO).toLocaleDateString("en-US")),
    ).not.toBeInTheDocument();
    unmount();

    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: true,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      renderDe(<AuditLogSection />);
      expect(await screen.findByText(de.settings.auditLog.heading)).toBeInTheDocument();
      expect(await screen.findByText(formatDate(CREATED_ISO, "de"))).toBeInTheDocument();
      expect(
        screen.queryByText(new Date(CREATED_ISO).toLocaleDateString("en-US")),
      ).not.toBeInTheDocument();
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });

  it("formats FileListItem visible and screen-reader dates in the active app locale", async () => {
    renderDe(
      <ul>
        <FileListItem
          file={{
            id: "file-1",
            originalName: "report.pdf",
            mimeType: "application/pdf",
            size: 2048,
            version: 1,
            parentId: null,
            toolChain: [],
            createdAt: CREATED_ISO,
          }}
          index={0}
          tabStop={true}
          onNavigate={() => {}}
        />
      </ul>,
    );

    const expectedDate = formatDate(CREATED_ISO, "de");
    const browserEnDate = new Date(CREATED_ISO).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });

    expect(await screen.findByLabelText(`${de.files.selectFile}: report.pdf`)).toBeInTheDocument();
    expect(screen.getByText(expectedDate)).toBeInTheDocument();
    const button = screen.getByRole("button", { name: "report.pdf" });
    const descId = button.getAttribute("aria-describedby");
    expect(descId).toBeTruthy();
    const descText = document.getElementById(descId ?? "")?.textContent;
    expect(descText).toContain(`${de.files.size}: 2.0 KB`);
    expect(descText).toContain(expectedDate);
    expect(descText).not.toContain(browserEnDate);
  });

  it("formats the autosave recovery banner timestamp in the active app locale", async () => {
    const timestamp = Date.parse(CREATED_ISO);
    renderDe(
      <AutosaveRecoveryBanner
        data={{
          version: 1,
          timestamp,
          state: {
            canvasSize: { width: 800, height: 600 },
            layers: [],
            objects: [],
            adjustments: {
              brightness: 0,
              contrast: 0,
              hue: 0,
              saturation: 0,
              luminance: 0,
              exposure: 0,
              vibrance: 0,
              warmth: 0,
            },
            filters: [],
            guides: [],
            sourceImageUrl: null,
            sourceImageSize: null,
            foregroundColor: "#000000",
            backgroundColor: "#ffffff",
          },
        }}
        onRestore={() => {}}
        onDiscard={() => {}}
      />,
    );

    const expectedBannerText = format(de.editor.ui.autosaveRecovery.message, {
      time: formatDateTime(timestamp, "de"),
    });
    expect(await screen.findByText(expectedBannerText)).toBeInTheDocument();
  });
});
