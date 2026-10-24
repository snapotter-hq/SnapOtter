// @vitest-environment jsdom

import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, useTranslation } from "@/contexts/i18n-context";

const setSentryTag = vi.hoisted(() => vi.fn());

vi.mock("@/lib/analytics", () => ({
  setSentryTag,
}));

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => storageMap.set(key, value)),
  removeItem: vi.fn((key: string) => storageMap.delete(key)),
  clear: vi.fn(() => storageMap.clear()),
  key: vi.fn((_index: number) => null),
  get length() {
    return storageMap.size;
  },
};

function LocaleProbe() {
  const { locale, dir, setLocale } = useTranslation();
  return (
    <div>
      <span data-testid="locale">{locale}</span>
      <span data-testid="dir">{dir}</span>
      <button type="button" data-testid="set-invalid" onClick={() => setLocale("invalid-code")}>
        Set invalid
      </button>
      <button type="button" data-testid="set-fr-ca" onClick={() => setLocale("fr-CA")}>
        Set fr-CA
      </button>
      <button type="button" data-testid="set-en" onClick={() => setLocale("en")}>
        Set en
      </button>
    </div>
  );
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
  setSentryTag.mockClear();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("I18nProvider locale validation (#3952)", () => {
  it("falls back to a supported browser locale when localStorage holds an unsupported code", async () => {
    storageMap.set("snapotter-locale", "xx-YY");
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["de-DE", "en"]);

    await act(async () => {
      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );
    });

    expect(screen.getByTestId("locale").textContent).toBe("de");
    expect(document.documentElement.lang).toBe("de");
  });

  it("normalizes regional, underscore, and case-variant codes in localStorage to supported codes", async () => {
    storageMap.set("snapotter-locale", "fr-CA");

    let unmount!: () => void;
    await act(async () => {
      ({ unmount } = render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      ));
    });

    expect(screen.getByTestId("locale").textContent).toBe("fr");
    unmount();

    storageMap.set("snapotter-locale", "en_US");
    await act(async () => {
      ({ unmount } = render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      ));
    });

    expect(screen.getByTestId("locale").textContent).toBe("en");
    unmount();

    storageMap.set("snapotter-locale", "pt_br");
    await act(async () => {
      ({ unmount } = render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      ));
    });

    expect(screen.getByTestId("locale").textContent).toBe("pt-BR");
    unmount();

    storageMap.set("snapotter-locale", "zh-HK");
    await act(async () => {
      ({ unmount } = render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      ));
    });

    expect(screen.getByTestId("locale").textContent).toBe("zh-TW");
    unmount();

    storageMap.set("snapotter-locale", "zh-Hans-SG");
    await act(async () => {
      ({ unmount } = render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      ));
    });

    expect(screen.getByTestId("locale").textContent).toBe("zh-CN");
    unmount();

    storageMap.set("snapotter-locale", "ar-SA");
    await act(async () => {
      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );
    });

    expect(screen.getByTestId("locale").textContent).toBe("ar");
    expect(screen.getByTestId("dir").textContent).toBe("rtl");
  });

  it("fetches instance default when localStorage holds an unsupported code and validates defaultLocale", async () => {
    storageMap.set("snapotter-locale", "unsupported-garbage");
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["en-US"]);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ defaultLocale: "ja-JP" }),
      }),
    );

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("locale").textContent).toBe("ja");
    });
  });

  it("ignores an unsupported defaultLocale returned by /api/v1/config/locale", async () => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["en-US"]);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ defaultLocale: "not-a-locale" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });
    expect(screen.getByTestId("locale").textContent).toBe("en");
  });

  it("does not overwrite an explicit setLocale call when fetchInstanceDefault resolves later", async () => {
    vi.spyOn(window.navigator, "languages", "get").mockReturnValue(["en-US"]);
    let resolveFetch!: (val: unknown) => void;
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );

    await act(async () => {
      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );
    });

    await act(async () => {
      screen.getByTestId("set-en").click();
    });

    await act(async () => {
      resolveFetch({
        ok: true,
        json: async () => ({ defaultLocale: "ja" }),
      });
    });

    expect(screen.getByTestId("locale").textContent).toBe("en");
  });

  it("normalizes or falls back when setLocale is called with non-canonical or unsupported codes", async () => {
    await act(async () => {
      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );
    });

    await act(async () => {
      screen.getByTestId("set-fr-ca").click();
    });
    expect(screen.getByTestId("locale").textContent).toBe("fr");
    expect(storageMap.get("snapotter-locale")).toBe("fr");

    await act(async () => {
      screen.getByTestId("set-invalid").click();
    });
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(storageMap.get("snapotter-locale")).toBe("en");
  });
});
