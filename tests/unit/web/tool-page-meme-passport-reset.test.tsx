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
import { useDuplicateStore } from "@/stores/duplicate-store";
import { useFeaturesStore } from "@/stores/features-store";
import { useFileStore } from "@/stores/file-store";
import { type MemeTemplate, useMemeStore } from "@/stores/meme-store";
import {
  type AnalyzeResult,
  passportFileKey,
  usePassportPhotoStore,
} from "@/stores/passport-photo-store";
import { useSplitStore } from "@/stores/split-store";
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
  Element.prototype.scrollIntoView = vi.fn();
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
  useDuplicateStore.getState().reset();
  useMemeStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  useSplitStore.getState().reset();
  useToolResultClaims.getState().reset();
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  useDuplicateStore.getState().reset();
  useMemeStore.getState().reset();
  usePassportPhotoStore.getState().reset();
  useSplitStore.getState().reset();
  useToolResultClaims.getState().reset();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("usePassportPhotoStore.reset (#2635)", () => {
  it("resets all analysis, generation, adjustment, and spec fields back to initial defaults", () => {
    const store = usePassportPhotoStore.getState();
    store.setAnalyzedFileKey("entry-1:portrait.jpg-10-100");
    store.setAnalyzeResult(makeAnalyzeResult("job-1", "portrait.jpg"));
    store.setAnalyzeError("No face detected");
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
    store.setGenerateError("Photo generation failed");
    store.setAnalyzing(true);
    store.setGenerating(true);

    usePassportPhotoStore.getState().reset();

    const after = usePassportPhotoStore.getState();
    expect(after.analyzedFileKey).toBeNull();
    expect(after.analyzeResult).toBeNull();
    expect(after.analyzeError).toBeNull();
    expect(after.generateResult).toBeNull();
    expect(after.generateError).toBeNull();
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

  it("stamps analyzedFileKey when setAnalyzing(true) or setGenerating(true) runs with a loaded file (#3187)", () => {
    const fileForKey = new File(["k"], "key.jpg", { type: "image/jpeg", lastModified: 42 });
    useFileStore.getState().setFiles([fileForKey]);
    const entryId = useFileStore.getState().entries[0]?.id;
    const expectedKey = passportFileKey(fileForKey, entryId);

    usePassportPhotoStore.getState().setAnalyzing(true);
    expect(usePassportPhotoStore.getState().analyzedFileKey).toBe(expectedKey);
    usePassportPhotoStore.getState().setAnalyzing(false);
    expect(usePassportPhotoStore.getState().analyzedFileKey).toBe(expectedKey);

    usePassportPhotoStore.getState().setAnalyzedFileKey(null);
    usePassportPhotoStore.getState().setGenerating(true);
    expect(usePassportPhotoStore.getState().analyzedFileKey).toBe(expectedKey);
    usePassportPhotoStore.getState().setGenerating(false);
    expect(usePassportPhotoStore.getState().analyzedFileKey).toBe(expectedKey);
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

  it("re-analyzes and clears generateResult when replacing a portrait via drop or paste on /image/passport-photo, including across 768px (#2689)", async () => {
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
      expect(usePassportPhotoStore.getState().generateResult?.downloadUrl).toContain("job-1");
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");

    // Crossing the 768px breakpoint preserves first.jpg and any generateError without re-analyzing.
    act(() => {
      usePassportPhotoStore.getState().setGenerateError("Temporary generation warning");
    });
    setMobileViewport(true);
    setMobileViewport(false);
    expect(analyzeCalls).toEqual(["first.jpg"]);
    expect(usePassportPhotoStore.getState().generateResult?.downloadUrl).toContain("job-1");
    expect(screen.getByText("Temporary generation warning")).toBeInTheDocument();

    // Drop a second portrait onto the page while staying on /image/passport-photo.
    const secondFile = new File(["portrait-2"], "second.jpg", { type: "image/jpeg" });
    const imageArea = screen.getByRole("region", { name: en.a11y.imageArea });
    await act(async () => {
      fireEvent.drop(imageArea, {
        dataTransfer: { files: [secondFile], types: ["Files"] },
      });
    });

    await waitFor(() => {
      expect(analyzeCalls).toEqual(["first.jpg", "second.jpg"]);
    });
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("second.jpg");
    expect(usePassportPhotoStore.getState().analyzeResult?.jobId).toBe("job-2");
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
    expect(usePassportPhotoStore.getState().generateError).toBeNull();
    expect(screen.queryByText("Temporary generation warning")).not.toBeInTheDocument();
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");

    // Generate on second.jpg, then paste a third portrait onto the page.
    fireEvent.click(await screen.findByTestId("passport-photo-generate"));
    await waitFor(() => {
      expect(usePassportPhotoStore.getState().generateResult?.downloadUrl).toContain("job-2");
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");

    const thirdFile = new File(["portrait-3"], "third.jpg", { type: "image/jpeg" });
    await act(async () => {
      const pasteEvent = new Event("paste", { bubbles: true, cancelable: true });
      Object.defineProperty(pasteEvent, "clipboardData", {
        value: { files: [thirdFile], items: [] },
      });
      document.dispatchEvent(pasteEvent);
    });

    await waitFor(() => {
      expect(analyzeCalls).toEqual(["first.jpg", "second.jpg", "third.jpg"]);
    });
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("third.jpg");
    expect(usePassportPhotoStore.getState().analyzeResult?.jobId).toBe("job-3");
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");
  });

  it("clears analyzeResult and generateResult on Clear all and analyzes the next uploaded portrait on /image/passport-photo (#2689)", async () => {
    renderRoutes("/image/passport-photo");

    const firstFile = new File(["portrait-1"], "first.jpg", { type: "image/jpeg" });
    await act(async () => {
      useFileStore.getState().setFiles([firstFile]);
    });

    const generateBtn = await screen.findByTestId("passport-photo-generate");
    expect(analyzeCalls).toEqual(["first.jpg"]);

    fireEvent.click(generateBtn);
    await waitFor(() => {
      expect(usePassportPhotoStore.getState().generateResult).not.toBeNull();
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");

    // Click "Clear all" in the left file list while staying on /image/passport-photo.
    fireEvent.click(screen.getByRole("button", { name: en.toolPage.clearAll }));

    expect(useFileStore.getState().files).toEqual([]);
    expect(usePassportPhotoStore.getState().analyzeResult).toBeNull();
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");

    // Uploading a second portrait (or re-uploading the same file) on the dropzone must analyze it.
    await act(async () => {
      useFileStore
        .getState()
        .setFiles([new File(["portrait-2"], "second.jpg", { type: "image/jpeg" })]);
    });

    await waitFor(() => {
      expect(analyzeCalls).toEqual(["first.jpg", "second.jpg"]);
    });
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("second.jpg");
    expect(usePassportPhotoStore.getState().analyzeResult?.jobId).toBe("job-2");

    // Direct useFileStore.getState().reset() also clears usePassportPhotoStore and allows re-uploading firstFile.
    act(() => {
      useFileStore.getState().reset();
    });
    expect(usePassportPhotoStore.getState().analyzedFileKey).toBeNull();
    expect(usePassportPhotoStore.getState().analyzeResult).toBeNull();
    expect(usePassportPhotoStore.getState().generateResult).toBeNull();

    await act(async () => {
      useFileStore.getState().setFiles([firstFile]);
    });
    await waitFor(() => {
      expect(analyzeCalls).toEqual(["first.jpg", "second.jpg", "first.jpg"]);
    });
    expect(usePassportPhotoStore.getState().analyzeResult?.filename).toBe("first.jpg");
    expect(usePassportPhotoStore.getState().analyzeResult?.jobId).toBe("job-3");

    const fileForKey = new File(["k"], "key.jpg", { type: "image/jpeg", lastModified: 42 });
    expect(passportFileKey(fileForKey)).toBe("key.jpg-1-42");
    expect(passportFileKey(fileForKey, "entry-9")).toBe("entry-9:key.jpg-1-42");
  });

  it("clears useDuplicateStore results and error on Clear all and on direct useFileStore.reset() (#3169)", async () => {
    renderRoutes("/image/find-duplicates");

    const fileA = new File(["img-a"], "one.png", { type: "image/png" });
    const fileB = new File(["img-b"], "two.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([fileA, fileB]);
    });

    await screen.findByTestId("find-duplicates-submit");

    const duplicateResult = {
      totalImages: 2,
      uniqueImages: 1,
      spaceSaveable: 512,
      duplicateGroups: [
        {
          groupId: 1,
          files: [
            {
              filename: "one.png",
              similarity: 100,
              width: 100,
              height: 100,
              fileSize: 512,
              format: "png",
              isBest: true,
              thumbnail: null,
            },
            {
              filename: "two.png",
              similarity: 100,
              width: 100,
              height: 100,
              fileSize: 512,
              format: "png",
              isBest: false,
              thumbnail: null,
            },
          ],
        },
      ],
    };

    act(() => {
      useDuplicateStore.setState({
        results: duplicateResult,
        error: "Previous scan warning",
        viewMode: "detail",
        selectedGroupIndex: 0,
        bestOverrides: { 0: 1 },
      });
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.clearAll }));

    expect(useFileStore.getState().files).toEqual([]);
    expect(useDuplicateStore.getState().results).toBeNull();
    expect(useDuplicateStore.getState().error).toBeNull();
    expect(useDuplicateStore.getState().viewMode).toBe("overview");
    expect(useDuplicateStore.getState().selectedGroupIndex).toBe(0);
    expect(useDuplicateStore.getState().bestOverrides).toEqual({});
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");

    // Direct useFileStore.getState().reset() when transitioning from non-empty to empty also resets useDuplicateStore.
    await act(async () => {
      useFileStore.getState().setFiles([fileA, fileB]);
    });
    act(() => {
      useDuplicateStore.setState({
        results: duplicateResult,
        error: "Another scan warning",
        viewMode: "detail",
        selectedGroupIndex: 0,
        bestOverrides: { 0: 0 },
      });
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");

    act(() => {
      useFileStore.getState().reset();
    });
    expect(useDuplicateStore.getState().results).toBeNull();
    expect(useDuplicateStore.getState().error).toBeNull();
    expect(useDuplicateStore.getState().viewMode).toBe("overview");
    expect(useDuplicateStore.getState().bestOverrides).toEqual({});
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");
  });

  it("clears useSplitStore tiles and zipBlobUrl and revokes blob URLs on Clear all and on direct useFileStore.reset() (#3169)", async () => {
    renderRoutes("/image/split");

    const fileA = new File(["img-a"], "one.png", { type: "image/png" });
    await act(async () => {
      useFileStore.getState().setFiles([fileA]);
    });

    await screen.findByTestId("split-submit");

    act(() => {
      useSplitStore.setState({
        columns: 4,
        rows: 2,
        tiles: [
          { row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: "blob:split-tile-1" },
          { row: 0, col: 1, label: "2", width: 100, height: 100, blobUrl: "blob:split-tile-2" },
        ],
        runFileCount: 1,
        zipBlobUrl: "blob:split-zip-1",
        error: "Previous split warning",
        imageDimensions: { width: 900, height: 1200 },
      });
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");
    revokeObjectURLMock.mockClear();

    fireEvent.click(screen.getByRole("button", { name: en.toolPage.clearAll }));

    expect(useFileStore.getState().files).toEqual([]);
    expect(useSplitStore.getState().tiles).toEqual([]);
    expect(useSplitStore.getState().runFileCount).toBe(0);
    expect(useSplitStore.getState().zipBlobUrl).toBeNull();
    expect(useSplitStore.getState().error).toBeNull();
    expect(useSplitStore.getState().imageDimensions).toBeNull();
    expect(useSplitStore.getState().columns).toBe(4);
    expect(useSplitStore.getState().rows).toBe(2);
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:split-zip-1");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:split-tile-1");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:split-tile-2");
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");

    // Direct useFileStore.getState().reset() when transitioning from non-empty to empty also resets useSplitStore.
    await act(async () => {
      useFileStore.getState().setFiles([fileA]);
    });
    act(() => {
      useSplitStore.setState({
        tiles: [
          { row: 0, col: 0, label: "1", width: 100, height: 100, blobUrl: "blob:split-tile-3" },
        ],
        runFileCount: 1,
        zipBlobUrl: "blob:split-zip-2",
        error: "Another split warning",
      });
    });
    expect(screen.getByTestId("work-probe")).toHaveTextContent("unsaved");
    revokeObjectURLMock.mockClear();

    act(() => {
      useFileStore.getState().reset();
    });
    expect(useSplitStore.getState().tiles).toEqual([]);
    expect(useSplitStore.getState().runFileCount).toBe(0);
    expect(useSplitStore.getState().zipBlobUrl).toBeNull();
    expect(useSplitStore.getState().error).toBeNull();
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:split-zip-2");
    expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:split-tile-3");
    expect(screen.getByTestId("work-probe")).toHaveTextContent("clean");
  });
});
