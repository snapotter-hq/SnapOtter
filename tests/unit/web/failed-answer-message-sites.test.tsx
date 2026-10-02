// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { en } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/lib/image-preview", () => ({
  needsServerPreview: vi.fn(() => false),
  fetchDecodedPreview: vi.fn(() => Promise.resolve(null)),
  revokePreviewUrl: vi.fn(),
}));

import { PdfToImageSettings } from "@/components/tools/pdf-to-image-settings";
import { I18nProvider, useTranslation } from "@/contexts/i18n-context";
import { useUrlImport } from "@/hooks/use-url-import";
import { format } from "@/lib/format";
import { AutomatePage } from "@/pages/automate-page";
import { useFileStore } from "@/stores/file-store";
import { useHtmlToImageStore } from "@/stores/html-to-image-store";
import { useMemeStore } from "@/stores/meme-store";
import { usePdfToImageStore } from "@/stores/pdf-to-image-store";

/**
 * The stores, hook, and screens outside the tool panels used to read a failed
 * answer as `body.error || fallback`, the same way the panels did before
 * #1858: an object-valued `error` reached the screen as "[object Object]", a
 * `details`-only answer showed the bare fallback, and FEATURE_NOT_INSTALLED
 * came through in the server's English (#1915). They now go through
 * failedAnswerMessage, each keeping its own fallback.
 */

const STATUS = 422;

/** A proxy's error page: res.json() rejects on it. */
const NOT_JSON = Symbol("not JSON");

const FEATURE_NOT_INSTALLED = {
  error: "Feature not installed",
  code: "FEATURE_NOT_INSTALLED",
  feature: "ocr",
  featureName: "OCR",
  estimatedSize: "1 GB",
};

/** Answers a real server sends, with what the site should end on. */
function answers(fallback: string): Array<[string, unknown, string]> {
  return [
    ["an object error", { error: { reason: "x" } }, fallback],
    ["details alone", { details: "Not enough memory" }, "Not enough memory"],
    ["a string error", { error: "Bad file" }, "Bad file"],
    [
      "the error handler's echo of one message",
      { error: "Bad file", details: "Bad file" },
      "Bad file",
    ],
    [
      "an error with different details",
      { error: "Invalid settings", details: "x: too big" },
      "Invalid settings: x: too big",
    ],
    ["a body that is not JSON", NOT_JSON, fallback],
  ];
}

let answer: { status: number; body: unknown };

function failedResponse() {
  return {
    ok: false,
    status: answer.status,
    json: async () => {
      if (answer.body === NOT_JSON) throw new SyntaxError("Unexpected token '<'");
      return answer.body;
    },
  };
}

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, value: string) => storageMap.set(key, value),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  key: () => null,
  get length() {
    return storageMap.size;
  },
};

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  vi.stubGlobal("URL", { ...URL, createObjectURL: () => "blob:fake", revokeObjectURL: () => {} });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => failedResponse()),
  );
  usePdfToImageStore.getState().reset();
  useHtmlToImageStore.getState().reset();
  useMemeStore.setState({ error: null, generating: false });
  useFileStore.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function pdf(): File {
  return new File(["%PDF"], "doc.pdf", { type: "application/pdf" });
}

interface StoreRow {
  site: string;
  fallback: string;
  /** Runs the request with the given locale and answers the text it ended on. */
  run: (t: typeof en) => Promise<string | null | undefined>;
}

const STORES: StoreRow[] = [
  {
    site: "pdf-to-image preview",
    fallback: `Failed: ${STATUS}`,
    run: async (t) => {
      await usePdfToImageStore.getState().loadPreview(pdf(), t);
      return usePdfToImageStore.getState().error;
    },
  },
  {
    site: "pdf-to-image convert",
    fallback: `Conversion failed: ${STATUS}`,
    run: async (t) => {
      usePdfToImageStore.setState({ file: pdf() });
      await usePdfToImageStore.getState().convert(t);
      return usePdfToImageStore.getState().error;
    },
  },
  {
    site: "html-to-image capture",
    fallback: "Capture failed",
    run: async (t) => {
      useHtmlToImageStore.getState().setUrl("https://example.com");
      await useHtmlToImageStore.getState().capture(t);
      return useHtmlToImageStore.getState().error;
    },
  },
  {
    site: "meme generate",
    fallback: `Generation failed: ${STATUS}`,
    run: async (t) => {
      useMemeStore.setState({ customLayout: "top-bottom", textBoxValues: [] });
      await useMemeStore.getState().generateMeme(t);
      return useMemeStore.getState().error;
    },
  },
  {
    site: "url import",
    fallback: `Fetch failed: ${STATUS}`,
    run: async () => {
      const { result } = renderHook(() => useUrlImport());
      await act(() => result.current.importUrls(["https://example.com/a.png"]));
      return result.current.entries[0]?.error;
    },
  },
];

describe.each(STORES)("$site: a failed answer", (row) => {
  it.each(answers(row.fallback))("ends on %s as readable text", async (_label, body, expected) => {
    answer = { status: STATUS, body };
    expect(await row.run(en)).toBe(expected);
  });
});

describe.each(STORES.filter((row) => row.site !== "url import"))(
  "$site: FEATURE_NOT_INSTALLED",
  (row) => {
    it("ends on the install message in the locale it was given", async () => {
      answer = { status: 501, body: FEATURE_NOT_INSTALLED };
      expect(await row.run(de)).toBe(
        format(de.errors.featureNotInstalled, { feature: de.featureBundles.ocr.name }),
      );
    });
  },
);

const GERMAN_INSTALL_MESSAGE = format(de.errors.featureNotInstalled, {
  feature: de.featureBundles.ocr.name,
});

/** Renders under the provider with German chosen, the way a viewer would. */
function inGerman({ children }: { children: React.ReactNode }) {
  return <I18nProvider>{children}</I18nProvider>;
}

describe("url import: FEATURE_NOT_INSTALLED", () => {
  it("ends on the install message in the viewer's locale", async () => {
    storageMap.set("snapotter-locale", "de");
    answer = { status: 501, body: FEATURE_NOT_INSTALLED };
    const { result } = renderHook(() => ({ hook: useUrlImport(), t: useTranslation().t }), {
      wrapper: inGerman,
    });
    await waitFor(() => expect(result.current.t).toBe(de));

    await act(() => result.current.hook.importUrls(["https://example.com/a.png"]));
    expect(result.current.hook.entries[0]?.error).toBe(GERMAN_INSTALL_MESSAGE);
  });
});

describe("pdf-to-image panel: FEATURE_NOT_INSTALLED", () => {
  // The preview answers fine here so the convert button enables; a failed
  // preview has its own test in pdf-to-image-preview-failure.test.tsx (#1954).
  it("hands the store the viewer's locale", async () => {
    storageMap.set("snapotter-locale", "de");
    answer = { status: 501, body: FEATURE_NOT_INSTALLED };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) =>
        String(input).includes("/preview")
          ? new Response(JSON.stringify({ pageCount: 1, thumbnails: [] }))
          : failedResponse(),
      ),
    );
    useFileStore.getState().setFiles([pdf()]);
    render(<PdfToImageSettings />, { wrapper: inGerman });

    const submit = await screen.findByTestId("pdf-to-image-submit");
    await waitFor(() => expect(submit).toBeEnabled());
    await waitFor(() => expect(usePdfToImageStore.getState().pageCount).toBe(1));
    await waitFor(() => expect(document.documentElement.lang).toBe("de"));
    fireEvent.click(submit);

    expect(await screen.findByText(GERMAN_INSTALL_MESSAGE)).toBeInTheDocument();
  });
});

describe("html-to-image capture: a failed answer that is not JSON", () => {
  it("ends on the fallback, not a JSON parse error", async () => {
    answer = { status: 502, body: NOT_JSON };
    useHtmlToImageStore.getState().setUrl("https://example.com");
    await useHtmlToImageStore.getState().capture(en);
    expect(useHtmlToImageStore.getState().capturing).toBe(false);
    expect(useHtmlToImageStore.getState().error).toBe("Capture failed");
  });
});

// ── Automate: importing a pipeline file ────────────────────────

const PIPELINE_FILE = JSON.stringify({
  format: "snapotter-pipeline",
  version: 1,
  name: "Imported",
  steps: [{ toolId: "resize", settings: {} }],
});

/** Lands on /automate in the viewer's locale and picks a pipeline file to import. */
async function importPipeline(t: typeof en): Promise<void> {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).includes("/pipeline/list")) {
        return new Response(JSON.stringify({ pipelines: [] }));
      }
      return failedResponse();
    }),
  );
  const created: HTMLInputElement[] = [];
  const realCreate = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    const el = realCreate(tag);
    if (tag === "input") {
      created.push(el as HTMLInputElement);
      (el as HTMLInputElement).click = () => {};
    }
    return el;
  }) as typeof document.createElement);

  render(
    <I18nProvider>
      <MemoryRouter initialEntries={["/automate"]}>
        <AutomatePage />
      </MemoryRouter>
    </I18nProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: t.automate.importButton }));
  const input = created.at(-1);
  if (!input) throw new Error("import created no file input");
  const file = new File([PIPELINE_FILE], "p.snapotter.json", { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file] });
  input.onchange?.({ target: input } as unknown as Event);
}

describe("automate pipeline import: a failed answer", () => {
  it.each(answers(en.automate.importFailed))(
    "shows %s as readable text",
    async (_label, body, expected) => {
      answer = { status: STATUS, body };
      await importPipeline(en);
      await waitFor(() => expect(screen.getByText(expected)).toBeInTheDocument());
      expect(document.body.textContent).not.toContain("[object Object]");
    },
  );

  it("shows FEATURE_NOT_INSTALLED in the viewer's locale", async () => {
    storageMap.set("snapotter-locale", "de");
    answer = { status: 501, body: FEATURE_NOT_INSTALLED };
    await importPipeline(de);
    await waitFor(() => expect(screen.getByText(GERMAN_INSTALL_MESSAGE)).toBeInTheDocument());
  });
});

// ── Source guard ───────────────────────────────────────────────

describe("no store, hook, or screen reads a failed answer's body by hand", () => {
  const SITES = [
    "stores/pdf-to-image-store.ts",
    "stores/html-to-image-store.ts",
    "stores/meme-store.ts",
    "hooks/use-url-import.ts",
    "components/settings/ai-features-section.tsx",
    "pages/automate-page.tsx",
  ];

  it.each(SITES)("%s goes through failedAnswerMessage", (path) => {
    const source = readFileSync(resolve(__dirname, `../../../apps/web/src/${path}`), "utf8");
    expect(source).toContain("failedAnswerMessage(");
    expect(source).not.toMatch(/\.(error|details)\s*\|\|/);
  });

  // The stores have no `t` of their own; each panel hands its locale in.
  it.each([
    ["pdf-to-image", /store\.loadPreview\(file, t\)/],
    ["pdf-to-image", /store\.convert\(t\)/],
    ["html-to-image", /store\.capture\(t\)/],
    ["meme-generator", /generateMeme\(t\)/],
  ])("the %s panel passes its locale to the store", (id, pattern) => {
    const source = readFileSync(
      resolve(__dirname, `../../../apps/web/src/components/tools/${id}-settings.tsx`),
      "utf8",
    );
    expect(source).toMatch(pattern);
  });
});
