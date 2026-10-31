// @vitest-environment jsdom

import { en, SafeError } from "@snapotter/shared";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider, loadLocale, localeLoaders, useTranslation } from "@/contexts/i18n-context";

const setSentryTag = vi.hoisted(() => vi.fn());
const captureHandledError = vi.hoisted(() => vi.fn().mockResolvedValue("test-event-id"));

vi.mock("@/lib/analytics", () => ({
  setSentryTag,
  captureHandledError,
}));

// Locale chunks load asynchronously, and a loaded CI runner can take longer than
// waitFor's 1 s default to resolve one (#4117).
const CHUNK_TIMEOUT = { timeout: 5_000 };

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
      <button type="button" data-testid="set-ar" onClick={() => setLocale("ar")}>
        Set ar
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
    // Document attributes follow the loaded catalog, so the German chunk has to
    // land before lang flips away from the English fallback (#4031).
    await waitFor(() => expect(document.documentElement.lang).toBe("de"), CHUNK_TIMEOUT);
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
    // Direction follows the loaded catalog (#4031), so rtl arrives with the
    // Arabic chunk rather than with the requested locale.
    await waitFor(() => expect(screen.getByTestId("dir").textContent).toBe("rtl"), CHUNK_TIMEOUT);
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

describe("I18nProvider document direction when a locale chunk fails (#4031)", () => {
  it("falls back to ltr and en attributes when the Arabic chunk fails to load", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalLoader = localeLoaders.ar;
    try {
      localeLoaders.ar = () => Promise.reject(new Error("Chunk load failed: ar.js 404"));
      storageMap.set("snapotter-locale", "ar");

      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );

      await waitFor(() => expect(setSentryTag).toHaveBeenCalledWith("locale", "en"), CHUNK_TIMEOUT);

      expect(screen.getByTestId("dir").textContent).toBe("ltr");
      expect(document.documentElement.dir).toBe("ltr");
      expect(document.documentElement.lang).toBe("en");
      // The saved preference survives the fallback so a later load can still
      // retry Arabic; only what is rendered falls back to English.
      expect(screen.getByTestId("locale").textContent).toBe("ar");
      expect(storageMap.get("snapotter-locale")).toBe("ar");
    } finally {
      localeLoaders.ar = originalLoader;
      errorSpy.mockRestore();
    }
  });

  it("falls back to ltr when a chunk resolves without the expected catalog", async () => {
    const originalLoader = localeLoaders.ar;
    try {
      localeLoaders.ar = async () => ({});
      storageMap.set("snapotter-locale", "ar");

      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );

      await waitFor(() => expect(setSentryTag).toHaveBeenCalledWith("locale", "en"), CHUNK_TIMEOUT);

      expect(screen.getByTestId("dir").textContent).toBe("ltr");
      expect(document.documentElement.dir).toBe("ltr");
      expect(document.documentElement.lang).toBe("en");
    } finally {
      localeLoaders.ar = originalLoader;
    }
  });

  it("returns a loaded rtl locale to en/ltr when a later switch falls back", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalLoader = localeLoaders.ar;
    try {
      storageMap.set("snapotter-locale", "de");

      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );
      await waitFor(() => expect(document.documentElement.lang).toBe("de"), CHUNK_TIMEOUT);

      localeLoaders.ar = () => Promise.reject(new Error("Chunk load failed: ar.js 404"));
      await act(async () => {
        screen.getByTestId("set-ar").click();
      });

      await waitFor(() => expect(document.documentElement.lang).toBe("en"), CHUNK_TIMEOUT);
      expect(screen.getByTestId("dir").textContent).toBe("ltr");
      expect(document.documentElement.dir).toBe("ltr");
      expect(screen.getByTestId("locale").textContent).toBe("ar");
    } finally {
      localeLoaders.ar = originalLoader;
      errorSpy.mockRestore();
    }
  });

  it("falls back to lang=en when an ltr chunk fails to load", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalLoader = localeLoaders.de;
    try {
      localeLoaders.de = () => Promise.reject(new Error("Chunk load failed: de.js 404"));
      storageMap.set("snapotter-locale", "de");

      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );

      await waitFor(() => expect(setSentryTag).toHaveBeenCalledWith("locale", "en"), CHUNK_TIMEOUT);

      expect(screen.getByTestId("locale").textContent).toBe("de");
      expect(document.documentElement.lang).toBe("en");
      expect(document.documentElement.dir).toBe("ltr");
    } finally {
      localeLoaders.de = originalLoader;
      errorSpy.mockRestore();
    }
  });

  it("keeps rtl and lang=ar when the Arabic chunk loads", async () => {
    const originalLoader = localeLoaders.ar;
    localeLoaders.ar = () =>
      new Promise((resolve) => setTimeout(() => resolve(originalLoader()), 1500));
    storageMap.set("snapotter-locale", "ar");

    render(
      <I18nProvider>
        <LocaleProbe />
      </I18nProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("dir").textContent).toBe("rtl"), CHUNK_TIMEOUT);
    expect(document.documentElement.dir).toBe("rtl");
    expect(document.documentElement.lang).toBe("ar");
    localeLoaders.ar = originalLoader;
  });
});

describe("loadLocale error handling and Sentry reporting (#1256)", () => {
  it("returns English without error logging for 'en' and unknown codes", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureHandledError.mockClear();

    const tEn = await loadLocale("en");
    expect(tEn).toBe(en);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();

    const tUnknown = await loadLocale("unknown-locale");
    expect(tUnknown).toBe(en);
    expect(errorSpy).not.toHaveBeenCalled();
    expect(captureHandledError).not.toHaveBeenCalled();

    errorSpy.mockRestore();
  });

  it("logs console.error and reports handled error to Sentry when chunk import fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    captureHandledError.mockClear();

    const originalLoader = localeLoaders.de;
    const chunkError = new Error("Chunk load failed: /assets/de-123.js 404");
    try {
      localeLoaders.de = () => Promise.reject(chunkError);

      const result = await loadLocale("de");
      expect(result).toBe(en);

      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy).toHaveBeenCalledWith("Failed to load locale chunk", {
        locale: "de",
        error: chunkError,
      });

      expect(captureHandledError).toHaveBeenCalledTimes(1);
      const [capturedErr, capturedTags] = captureHandledError.mock.calls[0];
      expect(capturedErr).toBeInstanceOf(SafeError);
      expect(capturedErr.message).toBe("Locale chunk failed to load");
      expect(capturedErr.code).toBe("locale-de");
      expect(capturedErr.cause).toBe(chunkError);
      expect(capturedTags).toEqual({ locale: "de", error_class: "operational" });
    } finally {
      localeLoaders.de = originalLoader;
      errorSpy.mockRestore();
    }
  });

  it("tags Sentry with 'en' fallback instead of requested locale when chunk fails to load", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    setSentryTag.mockClear();

    const originalLoader = localeLoaders.de;
    try {
      localeLoaders.de = () => Promise.reject(new Error("NetworkError"));
      storageMap.set("snapotter-locale", "de");

      render(
        <I18nProvider>
          <LocaleProbe />
        </I18nProvider>,
      );

      await waitFor(() => {
        expect(setSentryTag).toHaveBeenCalledWith("locale", "en");
      });
      expect(setSentryTag).not.toHaveBeenCalledWith("locale", "de");
    } finally {
      localeLoaders.de = originalLoader;
      errorSpy.mockRestore();
    }
  });

  it("handles analytics import rejection gracefully without unhandled rejection (#1256)", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const originalLoader = localeLoaders.de;
    try {
      localeLoaders.de = () => Promise.reject(new Error("Chunk failed"));
      storageMap.set("snapotter-locale", "de");

      captureHandledError.mockRejectedValueOnce(new Error("Analytics failed"));

      const result = await loadLocale("de");
      expect(result).toBe(en);
    } finally {
      localeLoaders.de = originalLoader;
      errorSpy.mockRestore();
    }
  });
});
