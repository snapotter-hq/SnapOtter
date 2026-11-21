// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

vi.mock("@/contexts/i18n-context", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/contexts/i18n-context")>();
  const { en: english } = await import("@snapotter/shared");
  return {
    ...actual,
    useTranslation: () => ({
      t: english,
      locale: "en",
      dir: "ltr",
      setLocale: () => {},
      supportedLocales: [],
    }),
  };
});

import { AspectRatioCalculatorSettings } from "@/components/tools/aspect-ratio-calculator-settings";
import { useFileStore } from "@/stores/file-store";

const ts = en.toolSettings["aspect-ratio-calculator"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function sentBody(fetchMock: ReturnType<typeof vi.fn>) {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return JSON.parse(String(init.body));
}

describe("AspectRatioCalculatorSettings", () => {
  beforeEach(() => {
    useFileStore.getState().reset();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("solves the height from a typed new width and shows the simplified ratio", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        width: 1920,
        height: 1080,
        ratio: "16:9",
        ratioDecimal: 1.7778,
        newWidth: 1280,
        newHeight: 720,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<AspectRatioCalculatorSettings />);

    fireEvent.change(screen.getByTestId("aspect-ratio-new-width"), { target: { value: "1280" } });
    fireEvent.click(screen.getByTestId("aspect-ratio-calculator-submit"));

    await waitFor(() => expect(screen.getByTestId("aspect-ratio-new-height")).toHaveValue(720));
    expect(sentBody(fetchMock)).toEqual({ width: 1920, height: 1080, newWidth: 1280, round: true });
    expect(screen.getByTestId("aspect-ratio-result")).toHaveTextContent("16:9");
    expect(useFileStore.getState().processing).toBe(false);
  });

  it("solves from whichever new dimension was typed last", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ratio: "16:9", newWidth: 1280, newHeight: 720 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AspectRatioCalculatorSettings />);

    fireEvent.change(screen.getByTestId("aspect-ratio-new-width"), { target: { value: "500" } });
    fireEvent.change(screen.getByTestId("aspect-ratio-new-height"), { target: { value: "720" } });
    expect(screen.getByTestId("aspect-ratio-new-width")).toHaveValue(null);
    fireEvent.click(screen.getByTestId("aspect-ratio-calculator-submit"));

    await waitFor(() => expect(screen.getByTestId("aspect-ratio-new-width")).toHaveValue(1280));
    expect(sentBody(fetchMock)).toEqual({ width: 1920, height: 1080, newHeight: 720, round: true });
  });

  it("swaps orientation and applies a preset to the original dimensions", () => {
    render(<AspectRatioCalculatorSettings />);

    fireEvent.click(screen.getByTestId("aspect-ratio-swap"));
    expect(screen.getByTestId("aspect-ratio-width")).toHaveValue(1080);
    expect(screen.getByTestId("aspect-ratio-height")).toHaveValue(1920);

    fireEvent.change(screen.getByTestId("aspect-ratio-preset"), { target: { value: "1" } });
    expect(screen.getByTestId("aspect-ratio-width")).toHaveValue(4);
    expect(screen.getByTestId("aspect-ratio-height")).toHaveValue(3);
  });

  it("asks for the ratio alone again once the typed new dimension is cleared", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ratio: "16:9", newWidth: null, newHeight: null }));
    vi.stubGlobal("fetch", fetchMock);
    render(<AspectRatioCalculatorSettings />);

    fireEvent.change(screen.getByTestId("aspect-ratio-new-width"), { target: { value: "1280" } });
    fireEvent.change(screen.getByTestId("aspect-ratio-new-width"), { target: { value: "" } });
    expect(screen.getByTestId("aspect-ratio-calculator-submit")).toBeEnabled();
    fireEvent.click(screen.getByTestId("aspect-ratio-calculator-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("aspect-ratio-result")).toHaveTextContent("16:9"),
    );
    expect(sentBody(fetchMock)).toEqual({ width: 1920, height: 1080, round: true });
  });

  it("clears the solved value when the original size changes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ ratio: "16:9", newWidth: 1280, newHeight: 720 })),
    );
    render(<AspectRatioCalculatorSettings />);

    fireEvent.change(screen.getByTestId("aspect-ratio-new-width"), { target: { value: "1280" } });
    fireEvent.click(screen.getByTestId("aspect-ratio-calculator-submit"));
    await waitFor(() => expect(screen.getByTestId("aspect-ratio-new-height")).toHaveValue(720));

    fireEvent.change(screen.getByTestId("aspect-ratio-width"), { target: { value: "1440" } });
    expect(screen.getByTestId("aspect-ratio-new-height")).toHaveValue(null);
    expect(screen.getByTestId("aspect-ratio-new-width")).toHaveValue(1280);
    expect(screen.queryByTestId("aspect-ratio-result")).not.toBeInTheDocument();
  });

  it("locks the inputs while a request is in flight", async () => {
    let resolveFetch: (res: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>((resolve) => {
            resolveFetch = resolve;
          }),
      ),
    );
    render(<AspectRatioCalculatorSettings />);

    fireEvent.click(screen.getByTestId("aspect-ratio-calculator-submit"));
    await waitFor(() => expect(screen.getByTestId("aspect-ratio-width")).toBeDisabled());
    expect(screen.getByTestId("aspect-ratio-swap")).toBeDisabled();
    expect(screen.getByTestId("aspect-ratio-preset")).toBeDisabled();

    resolveFetch(jsonResponse({ ratio: "16:9", newWidth: null, newHeight: null }));
    await waitFor(() => expect(screen.getByTestId("aspect-ratio-width")).toBeEnabled());
  });

  it("disables calculate while an original dimension is missing", () => {
    render(<AspectRatioCalculatorSettings />);
    fireEvent.change(screen.getByTestId("aspect-ratio-width"), { target: { value: "" } });
    expect(screen.getByTestId("aspect-ratio-calculator-submit")).toBeDisabled();
  });

  it("shows the server's error and no ratio when the request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(jsonResponse({ error: "Invalid settings" }, 400)),
    );
    render(<AspectRatioCalculatorSettings />);

    fireEvent.click(screen.getByTestId("aspect-ratio-calculator-submit"));

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(useFileStore.getState().error).toBeTruthy();
    expect(screen.queryByTestId("aspect-ratio-result")).not.toBeInTheDocument();
  });

  it("rejects a malformed 2xx answer", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ ratio: 16 })));
    render(<AspectRatioCalculatorSettings />);

    fireEvent.click(screen.getByTestId("aspect-ratio-calculator-submit"));

    await waitFor(() => expect(useFileStore.getState().processing).toBe(false));
    expect(useFileStore.getState().error).toBe(en.errors.invalidServerResponse);
    expect(screen.queryByText(ts.ratio)).not.toBeInTheDocument();
  });
});
