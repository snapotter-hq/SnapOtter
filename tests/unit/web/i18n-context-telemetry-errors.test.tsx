// @vitest-environment jsdom
//
// #4044: a locale bundle that fails to load, or a Sentry tag that can't be set,
// used to disappear without a trace. Both say so locally now.
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useTranslation } from "@/contexts/i18n-context";

const setSentryTag = vi.hoisted(() => vi.fn());
vi.mock("@/lib/analytics", () => ({ setSentryTag }));
// The French bundle is the failing chunk in these tests.
vi.mock("@snapotter/shared/i18n/fr.js", () => {
  throw new Error("locale chunk failed");
});

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  key: vi.fn(() => null),
  get length() {
    return storageMap.size;
  },
};

function Probe() {
  const { locale } = useTranslation();
  return <span data-testid="locale">{locale}</span>;
}

async function renderProvider(): Promise<void> {
  await act(async () => {
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
  });
}

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["en-US", "en"]);
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ defaultLocale: "en" }),
    }),
  );
  setSentryTag.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("i18n telemetry failures are not silent (#4044)", () => {
  it("warns when a locale load failure cannot be reported to analytics", async () => {
    storageMap.set("snapotter-locale", "fr");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderProvider();

    expect(warn.mock.calls.some(([message]) => String(message).includes("analytics"))).toBe(true);
  });

  it("warns when tagging Sentry with the active locale fails", async () => {
    setSentryTag.mockImplementationOnce(() => {
      throw new Error("tag failed");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    await renderProvider();

    expect(warn.mock.calls.some(([message]) => String(message).includes("Sentry"))).toBe(true);
  });
});
