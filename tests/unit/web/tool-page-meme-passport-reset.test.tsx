// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StrictMode } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router";
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

import { en } from "@snapotter/shared";
import { de } from "@snapotter/shared/i18n/de.js";
import { I18nProvider } from "@/contexts/i18n-context";
import { useWorkInFlight } from "@/hooks/use-work-in-flight";
import { ToolPage } from "@/pages/tool-page";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";
import { type MemeTemplate, useMemeStore } from "@/stores/meme-store";
import { type AnalyzeResult, usePassportPhotoStore } from "@/stores/passport-photo-store";
import { useToolResultClaims } from "@/stores/tool-result-claims";

const PREVIEW_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

const TEMPLATE: MemeTemplate = {
  id: "drake",
  name: "Drake Hotline Bling",
  aliases: ["drake"],
  tags: ["reaction"],
  category: "reaction",
  filename: "drake.jpg",
  width: 600,
  height: 600,
  popularity: 100,
  textBoxes: [
    { id: "top", x: 50, y: 0, width: 50, height: 50, defaultText: "Nah" },
    { id: "bottom", x: 50, y: 50, width: 50, height: 50, defaultText: "Yeah" },
  ],
};

function makeAnalyzeResult(jobId: string, filename: string): AnalyzeResult {
  return {
    preview: PREVIEW_PNG,
    landmarks: {
      leftEye: { x: 0.42, y: 0.4 },
      rightEye: { x: 0.58, y: 0.4 },
      eyeCenter: { x: 0.5, y: 0.4 },
      chin: { x: 0.5, y: 0.62 },
      forehead: { x: 0.5, y: 0.25 },
      crown: { x: 0.5, y: 0.18 },
      nose: { x: 0.5, y: 0.5 },
      faceCenterX: 0.5,
    },
    imageWidth: 900,
    imageHeight: 1200,
    jobId,
    filename,
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

let fetchMock: ReturnType<typeof vi.fn>;
let revokeObjectURLMock: ReturnType<typeof vi.fn>;
let analyzeCalls: string[];
let mobileMatches = false;
const mediaListeners = new Set<(e: MediaQueryListEvent) => void>();

function setMobileViewport(matches: boolean) {
  mobileMatches = matches;
  act(() => {
    for (const listener of mediaListeners) {
      listener({ matches } as MediaQueryListEvent);
    }
  });
}

function WorkProbe() {
  const work = useWorkInFlight();
  return <div data-testid="work-probe">{work ? work.kind : "clean"}</div>;
}

function renderRoutes(
  initialEntry: string | { pathname: string; state?: unknown },
  strict = false,
) {
  const tree = (
    <I18nProvider>
      <MemoryRouter initialEntries={[initialEntry]}>
        <Link to="/image/rotate" data-testid="go-rotate">
          Rotate
        </Link>
        <Link to="/image/passport-photo" data-testid="go-passport">
          Passport
        </Link>
        <Link to="/image/meme-generator" data-testid="go-meme">
          Meme
        </Link>
        <Link to="/files" data-testid="go-files">
          Files
        </Link>
        <WorkProbe />
        <Routes>
          <Route path="/:section/:toolId" element={<ToolPage />} />
          <Route path="/files" element={<div data-testid="files-page">Files Page</div>} />
        </Routes>
      </MemoryRouter>
    </I18nProvider>
  );
  return render(strict ? <StrictMode>{tree}</StrictMode> : tree);
}

beforeEach(() => {
  storageMap.clear();
  analyzeCalls = [];
  mobileMatches = false;
  mediaListeners.clear();
  vi.stubGlobal("localStorage", localStorageMock);
  let blobSeq = 0;
  revokeObjectURLMock = vi.fn();
  vi.stubGlobal(
    "URL",
    Object.assign(URL, {
      createObjectURL: vi.fn(() => `blob:test-${++blobSeq}`),
      revokeObjectURL: revokeObjectURLMock,
    }),
  );
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  class ImmediateImage {
    width = 900;
    height = 1200;
    naturalWidth = 900;
    naturalHeight = 1200;
    onload: (() => void) | null = null;
    set src(_val: string) {
      this.onload?.();
    }
  }
  vi.stubGlobal("Image", ImmediateImage);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 1,
    fillRect: vi.fn(),
    drawImage: vi.fn(),
    setLineDash: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D);
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      get matches() {
        return query.includes("max-width") ? mobileMatches : false;
      },
      media: query,
      onchange: null,
      addEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        if (query.includes("max-width")) mediaListeners.add(cb);
      },
      removeEventListener: (_type: string, cb: (e: MediaQueryListEvent) => void) => {
        mediaListeners.delete(cb);
      },
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    })),
  );

  useFeaturesStore.setState({
    loaded: true,
    bundles: [
      {
        id: "background-removal",
        name: "Background Removal",
        description: "",
        tools: ["passport-photo"],
        estimatedSize: "300 MB",
        status: "installed",
      },
      {
        id: "face-detection",
        name: "Face Detection",
        description: "",
        tools: ["passport-photo"],
        estimatedSize: "100 MB",
        status: "installed",
      },
    ],
  });

  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes("/api/v1/meme-templates")) {
      return new Response(
        JSON.stringify({ version: 1, categories: ["reaction"], templates: [TEMPLATE] }),
        { status: 200 },
      );
    }
    if (url.includes("/api/v1/tools/image/passport-photo/analyze")) {
      const form = init?.body as FormData | undefined;
      const uploaded = form?.get("file") as File | null;
      const name = uploaded?.name ?? "unknown.jpg";
      analyzeCalls.push(name);
      return new Response(JSON.stringify(makeAnalyzeResult(`job-${analyzeCalls.length}`, name)), {
        status: 200,
      });
    }
    if (url.includes("/api/v1/tools/image/passport-photo/generate")) {
      return new Response(
        JSON.stringify({
          downloadUrl: `/api/v1/download/job-${analyzeCalls.length}/passport.jpg`,
          dimensions: { width: 600, height: 600 },
          spec: { country: "US", document: "passport" },
        }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  useFileStore.getState().reset();
  useMemeStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  useToolResultClaims.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  useMemeStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  useToolResultClaims.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePassportPhotoStore.reset (#2635)", () => {
  it("resets all analysis, generation, adjustment, and spec fields back to initial defaults", () => {
    const store = usePassportPhotoStore.getState();
    store.setAnalyzeResult(makeAnalyzeResult("job-1", "portrait.jpg"));
    store.setCountryCode("GB");
    store.setDocumentType("visa");
    store.setBgColor("#F0F0F0");
    store.setMaxFileSizeKb(200);
    store.setDpi(600);
    store.setCustomDimensions(40, 50);
    store.setAdjustX(0.12);
    store.setAdjustY(-0.08);
    store.setZoom(1.5);
    store.setGenerateResult({
      downloadUrl: "/api/v1/download/job-1/passport.jpg",
      dimensions: { width: 600, height: 600 },
      spec: { country: "CUSTOM", document: "visa" },
    });
    store.setAnalyzing(true);
    store.setGenerating(true);

    usePassportPhotoStore.getState().reset();

    const after = usePassportPhotoStore.getState();
    expect(after.analyzeResult).toBeNull();
    expect(after.generateResult).toBeNull();
    expect(after.analyzing).toBe(false);
    expect(after.generating).toBe(false);
    expect(after.countryCode).toBe("US");
    expect(after.documentType).toBe("passport");
    expect(after.bgColor).toBe("#FFFFFF");
    expect(after.maxFileSizeKb).toBe(0);
    expect(after.dpi).toBe(300);
    expect(after.customWidthMm).toBeNull();
    expect(after.customHeightMm).toBeNull();
    expect(after.adjustX).toBe(0);
    expect(after.adjustY).toBe(0);
    expect(after.zoom).toBe(1);
  });
});

describe("ToolPage resets usePassportPhotoStore and useMemeStore across tool changes and unmounts (#2635)", () => {
  it("resets usePassportPhotoStore when leaving /image/passport-photo for /files and analyzes a newly uploaded portrait on return", async () => {
    renderRoutes("/image/passport-photo");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["portrait-1"], "first.jpg", { type: "image/jpeg" })]);
    });

    const generateBtn = await screen.findByTestId("passport-photo-generate");
    expect(analyzeCalls).toEqual(["first.jpg"]);

    fireEvent.click(generateBtn);
    await waitFor(() => {
      expect(usePassportPhotoStore.getState().generateResult).not.toBeNull();
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");

    // Navigate away to /files (unmounts ToolPage).
    fireEvent.click(screen.getByTestId("go-files"));
    expect(await screen.findByTestId("files-page")).toBeInTheDocument();

    expect(usePassportPhotoStore.getState().analyzeResult).toBeNull();
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
    expect(usePassportPhotoStore.getState().analyzing).toBe(false);
    expect(usePassportPhotoStore.getState().generating).toBe(false);

    // Navigate back to /image/passport-photo: page must not be dirty, and a new portrait must be analyzed.
    fireEvent.click(screen.getByTestId("go-passport"));
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["portrait-2"], "second.jpg", { type: "image/jpeg" })]);
    });

    await waitFor(() => {
      expect(analyzeCalls).toEqual(["first.jpg", "second.jpg"]);
    });
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("second.jpg");
  });

  it("resets usePassportPhotoStore when switching from /image/passport-photo to /image/rotate and back without analyzing rotate's file", async () => {
    renderRoutes("/image/passport-photo");

    act(() => {
      usePassportPhotoStore.setState({
        analyzeResult: makeAnalyzeResult("job-1", "first.jpg"),
        generateResult: {
          downloadUrl: "/api/v1/download/job-1/passport.jpg",
          dimensions: { width: 600, height: 600 },
          spec: { country: "US", document: "passport" },
        },
        analyzing: true,
        generating: true,
        adjustX: 0.2,
        adjustY: -0.1,
        zoom: 2,
        countryCode: "CUSTOM",
        customWidthMm: 45,
        customHeightMm: 55,
      });
    });

    fireEvent.click(screen.getByTestId("go-rotate"));

    await waitFor(() => {
      expect(usePassportPhotoStore.getState().analyzeResult).toBeNull();
    });
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
    expect(usePassportPhotoStore.getState().analyzing).toBe(false);
    expect(usePassportPhotoStore.getState().generating).toBe(false);
    expect(usePassportPhotoStore.getState().adjustX).toBe(0);
    expect(usePassportPhotoStore.getState().adjustY).toBe(0);
    expect(usePassportPhotoStore.getState().zoom).toBe(1);
    expect(usePassportPhotoStore.getState().countryCode).toBe("US");
    expect(usePassportPhotoStore.getState().customWidthMm).toBeNull();
    expect(usePassportPhotoStore.getState().customHeightMm).toBeNull();

    // Load a file while on /image/rotate; switching to /image/passport-photo must reset useFileStore
    // without auto-analyzing rotate's file.
    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["rotate-bytes"], "rotate-only.jpg", { type: "image/jpeg" })]);
    });

    fireEvent.click(screen.getByTestId("go-passport"));
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");
    expect(analyzeCalls).toEqual([]);

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["portrait-2"], "second.jpg", { type: "image/jpeg" })]);
    });

    await waitFor(() => {
      expect(analyzeCalls).toEqual(["second.jpg"]);
    });
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("second.jpg");
  });

  it("keeps analyzing true under StrictMode when opening /image/passport-photo with fromLibrary: true", async () => {
    let finishAnalyze: (res: Response) => void = () => {};
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/api/v1/tools/image/passport-photo/analyze")) {
        const form = init?.body as FormData | undefined;
        const uploaded = form?.get("file") as File | null;
        const name = uploaded?.name ?? "unknown.jpg";
        analyzeCalls.push(name);
        return new Promise<Response>((resolve) => {
          finishAnalyze = resolve;
        });
      }
      return Promise.resolve(
        new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 }),
      );
    });

    // Clear any stale result that might have been in usePassportPhotoStore before mount,
    // and pre-populate useFileStore the way /files does before navigating with fromLibrary: true.
    usePassportPhotoStore.setState({
      analyzeResult: makeAnalyzeResult("stale-job", "stale.jpg"),
    });
    useFileStore
      .getState()
      .setFiles([new File(["library-portrait"], "from-library.jpg", { type: "image/jpeg" })]);

    renderRoutes({ pathname: "/image/passport-photo", state: { fromLibrary: true } }, true);

    await waitFor(() => {
      expect(analyzeCalls).toEqual(["from-library.jpg"]);
    });
    expect(usePassportPhotoStore.getState().analyzing).toBe(true);
    expect(usePassportPhotoStore.getState().analyzeResult).toBeNull();
    expect(screen.getByTestId("work-probe")).toHaveTextContent("processing");

    await act(async () => {
      finishAnalyze(
        new Response(JSON.stringify(makeAnalyzeResult("job-lib", "from-library.jpg")), {
          status: 200,
        }),
      );
    });

    await waitFor(() => {
      expect(usePassportPhotoStore.getState().analyzing).toBe(false);
    });
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("from-library.jpg");
  });

  it("resets useMemeStore when switching from /image/meme-generator to /image/rotate and when ToolPage unmounts", async () => {
    const view = renderRoutes("/image/meme-generator");

    expect(await screen.findByTestId("template-drake")).toBeInTheDocument();

    act(() => {
      useMemeStore.setState({
        phase: "result",
        selectedTemplate: TEMPLATE,
        customImageUrl: "blob:custom-meme",
        generating: true,
        resultUrl: "/api/v1/download/meme-1.png",
        downloadUrl: "/api/v1/download/meme-1.png",
      });
    });

    // Switch to another tool route (/image/rotate) while ToolPage stays mounted.
    fireEvent.click(screen.getByTestId("go-rotate"));

    await waitFor(() => {
      expect(useMemeStore.getState().phase).toBe("gallery");
    });
    expect(useMemeStore.getState().resultUrl).toBeNull();
    expect(useMemeStore.getState().downloadUrl).toBeNull();
    expect(useMemeStore.getState().generating).toBe(false);
    expect(useMemeStore.getState().selectedTemplate).toBeNull();
    expect(useMemeStore.getState().customImageUrl).toBeNull();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:custom-meme");

    // Navigate back to /image/meme-generator: starts clean in gallery phase and reloads templates.
    fireEvent.click(screen.getByTestId("go-meme"));
    expect(await screen.findByTestId("template-drake")).toBeInTheDocument();
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");

    // Seed result again and unmount ToolPage by navigating to /files.
    act(() => {
      useMemeStore.setState({
        phase: "result",
        resultUrl: "/api/v1/download/meme-2.png",
        downloadUrl: "/api/v1/download/meme-2.png",
        generating: true,
      });
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("processing");

    view.unmount();

    expect(useMemeStore.getState().phase).toBe("gallery");
    expect(useMemeStore.getState().resultUrl).toBeNull();
    expect(useMemeStore.getState().downloadUrl).toBeNull();
    expect(useMemeStore.getState().generating).toBe(false);
  });

  it("preserves usePassportPhotoStore and useMemeStore across the 768px mobile/desktop breakpoint", async () => {
    renderRoutes("/image/passport-photo");

    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["portrait-1"], "first.jpg", { type: "image/jpeg" })]);
    });
    await waitFor(() => {
      expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("first.jpg");
    });

    setMobileViewport(true);
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("first.jpg");
    expect(analyzeCalls).toEqual(["first.jpg"]);

    setMobileViewport(false);
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("first.jpg");
    expect(analyzeCalls).toEqual(["first.jpg"]);

    fireEvent.click(screen.getByTestId("go-meme"));
    expect(await screen.findByTestId("template-drake")).toBeInTheDocument();

    act(() => {
      useMemeStore.getState().selectTemplate(TEMPLATE);
      useMemeStore.getState().updateTextValue("top", "Keep across breakpoint");
    });

    setMobileViewport(true);
    expect(useMemeStore.getState().phase).toBe("editor");
    expect(useMemeStore.getState().selectedTemplate).toBe(TEMPLATE);
    expect(useMemeStore.getState().textBoxValues[0]?.text).toBe("Keep across breakpoint");
  });

  it("rejects malformed 2xx passport-photo analyze and generate payloads without crashing PassportPhotoPreview or dirtying useWorkInFlight (#3142)", async () => {
    const validAnalyze = makeAnalyzeResult("job-1", "portrait.jpg");
    const malformedAnalyzeBodies: Array<() => Response> = [
      () => new Response(JSON.stringify({}), { status: 200 }),
      () => new Response(JSON.stringify(null), { status: 200 }),
      () => new Response(JSON.stringify([]), { status: 200 }),
      () => new Response(JSON.stringify({ ...validAnalyze, preview: "" }), { status: 200 }),
      () => new Response(JSON.stringify({ ...validAnalyze, landmarks: null }), { status: 200 }),
      () =>
        new Response(
          JSON.stringify({
            ...validAnalyze,
            landmarks: { ...validAnalyze.landmarks, leftEye: { x: "bad", y: 0.4 } },
          }),
          { status: 200 },
        ),
      () =>
        new Response(
          JSON.stringify({
            ...validAnalyze,
            landmarks: { ...validAnalyze.landmarks, faceCenterX: null },
          }),
          { status: 200 },
        ),
      () => new Response(JSON.stringify({ ...validAnalyze, imageWidth: 0 }), { status: 200 }),
      () => new Response(JSON.stringify({ ...validAnalyze, imageHeight: -10 }), { status: 200 }),
      () => new Response(JSON.stringify({ ...validAnalyze, jobId: "" }), { status: 200 }),
      () => new Response(JSON.stringify({ ...validAnalyze, filename: "" }), { status: 200 }),
      () => new Response("<html>proxy gateway ok</html>", { status: 200 }),
      () =>
        ({
          ok: true,
          status: 200,
          json: () => Promise.reject(new TypeError("Analyze stream disconnected")),
        }) as unknown as Response,
    ];

    const malformedGenerateBodies: Array<() => Response> = [
      () => new Response(JSON.stringify({}), { status: 200 }),
      () => new Response(JSON.stringify(null), { status: 200 }),
      () => new Response(JSON.stringify([]), { status: 200 }),
      () => new Response(JSON.stringify({ downloadUrl: "" }), { status: 200 }),
      () => new Response(JSON.stringify({ downloadUrl: 123 }), { status: 200 }),
      () => new Response("<html>proxy gateway ok</html>", { status: 200 }),
      () =>
        ({
          ok: true,
          status: 200,
          json: () => Promise.reject(new TypeError("Generate stream disconnected")),
        }) as unknown as Response,
    ];

    let analyzeIdx = 0;
    let generateIdx = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/tools/image/passport-photo/analyze")) {
        return (
          malformedAnalyzeBodies[analyzeIdx++]?.() ??
          new Response(JSON.stringify(validAnalyze), { status: 200 })
        );
      }
      if (url.includes("/api/v1/tools/image/passport-photo/generate")) {
        return (
          malformedGenerateBodies[generateIdx++]?.() ??
          new Response(
            JSON.stringify({
              downloadUrl: "/api/v1/download/job-1/passport.jpg",
              dimensions: { width: 600, height: 600 },
              spec: { country: "US", document: "passport" },
            }),
            { status: 200 },
          )
        );
      }
      return new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 });
    });

    renderRoutes("/image/passport-photo");

    for (let i = 0; i < malformedAnalyzeBodies.length; i++) {
      await act(async () => {
        useFileStore
          .getState()
          .setFiles([new File([`portrait-${i}`], `bad-${i}.jpg`, { type: "image/jpeg" })]);
      });

      const expectedError =
        i === malformedAnalyzeBodies.length - 1
          ? "Analyze stream disconnected"
          : en.errors.invalidServerResponse;
      await waitFor(() => {
        expect(screen.getByText(expectedError)).toBeInTheDocument();
      });
      expect(usePassportPhotoStore.getState().analyzeResult).toBeNull();
      expect(usePassportPhotoStore.getState().analyzing).toBe(false);
      expect(screen.queryByTestId("passport-photo-generate")).not.toBeInTheDocument();
      expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");
    }

    // Next file gets a valid analyze response, then exercises malformed generate responses.
    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["portrait-good"], "good.jpg", { type: "image/jpeg" })]);
    });
    expect(await screen.findByTestId("passport-photo-generate")).toBeInTheDocument();
    expect(usePassportPhotoStore.getState().analyzeResult).toEqual(validAnalyze);

    for (let i = 0; i < malformedGenerateBodies.length; i++) {
      const btn = await screen.findByTestId("passport-photo-generate");
      await act(async () => {
        fireEvent.click(btn);
      });
      const expectedError =
        i === malformedGenerateBodies.length - 1
          ? "Generate stream disconnected"
          : en.errors.invalidServerResponse;
      await waitFor(() => {
        expect(screen.getByText(expectedError)).toBeInTheDocument();
      });
      expect(usePassportPhotoStore.getState().generateResult).toBeNull();
      expect(usePassportPhotoStore.getState().generating).toBe(false);
      expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");
    }
    expect(generateIdx).toBe(malformedGenerateBodies.length);
  });

  it("renders ErrorView in the active locale on /image/meme-generator when /api/v1/meme-templates returns a malformed 200 payload (#3142)", async () => {
    storageMap.set("snapotter-locale", "de");
    let templateRequests = 0;
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/v1/meme-templates")) {
        templateRequests++;
        return new Response(JSON.stringify({}), { status: 200 });
      }
      return new Response(JSON.stringify({ authEnabled: false, bundles: [] }), { status: 200 });
    });

    renderRoutes("/image/rotate");
    expect(await screen.findByTitle("Sprache")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("go-meme"));

    expect(await screen.findByText(de.errors.invalidServerResponse)).toBeInTheDocument();
    expect(useMemeStore.getState().templates).toEqual([]);
    expect(useMemeStore.getState().loading).toBe(false);
    expect(templateRequests).toBe(1);
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");
  });
});
