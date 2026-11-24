// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { ANALYTICS_EVENTS, en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const copyToClipboard = vi.hoisted(() => vi.fn(async () => true));

vi.mock("@/lib/utils", async (importOriginal) => {
  const actual: Record<string, unknown> = await importOriginal();
  return { ...actual, copyToClipboard };
});
vi.mock("@/lib/analytics", async () => {
  const { analyticsModuleMock } = await import("../../helpers/mock-analytics.js");
  return analyticsModuleMock();
});

import { ConvertCaseSettings } from "@/components/tools/convert-case-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { track } from "@/lib/analytics";
import { CASE_MODES } from "../../../apps/api/src/lib/convert-case.js";

const ROUTE = "/api/v1/tools/files/convert-case";
const ts = en.toolSettings["convert-case"];

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Answers the tool route with `answer`, and anything the providers fetch on mount with {}. */
function server(answer: () => Promise<Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
    String(input).endsWith(ROUTE) ? answer() : respond({}),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function toolCall(fetchMock: ReturnType<typeof server>) {
  const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith(ROUTE));
  if (!call) throw new Error("tool route was never called");
  const init = call[1] as RequestInit;
  return { init, body: JSON.parse(String(init.body)) };
}

function renderPanel() {
  return render(
    <I18nProvider>
      <ConvertCaseSettings />
    </I18nProvider>,
  );
}

beforeEach(() => {
  const stored = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => stored.get(k) ?? null,
    setItem: (k: string, v: string) => void stored.set(k, v),
    removeItem: (k: string) => void stored.delete(k),
    clear: () => stored.clear(),
  });
  vi.mocked(track).mockClear();
  copyToClipboard.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("convert-case settings", () => {
  it("offers a labelled button for every mode the server accepts", () => {
    server(() => respond({}));
    renderPanel();
    for (const mode of CASE_MODES) {
      expect(screen.getByTestId(`convert-case-mode-${mode}`)).toHaveTextContent(ts.modes[mode]);
    }
  });

  it("disables the mode buttons until there is text", () => {
    server(() => respond({}));
    renderPanel();
    expect(screen.getByTestId("convert-case-mode-upper")).toBeDisabled();
    fireEvent.change(screen.getByTestId("convert-case-input"), { target: { value: "hi" } });
    expect(screen.getByTestId("convert-case-mode-upper")).toBeEnabled();
  });

  it("posts the text, mode and UI locale as JSON and shows the result", async () => {
    const fetchMock = server(() => respond({ mode: "title", result: "Hello World" }));
    renderPanel();

    fireEvent.change(screen.getByTestId("convert-case-input"), {
      target: { value: "hello world" },
    });
    fireEvent.click(screen.getByTestId("convert-case-mode-title"));

    expect(await screen.findByTestId("convert-case-result")).toHaveValue("Hello World");
    const { init, body } = toolCall(fetchMock);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(body).toEqual({ text: "hello world", mode: "title", locale: "en" });
    expect(track).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.TOOL_STARTED,
      expect.objectContaining({ tool_id: "convert-case" }),
    );
  });

  it("clears the result when the text changes", async () => {
    server(() => respond({ mode: "upper", result: "HI" }));
    renderPanel();

    fireEvent.change(screen.getByTestId("convert-case-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("convert-case-mode-upper"));
    await screen.findByTestId("convert-case-result");

    fireEvent.change(screen.getByTestId("convert-case-input"), { target: { value: "hi there" } });
    expect(screen.queryByTestId("convert-case-result")).toBeNull();
  });

  it("shows the server's error and no result when the request fails", async () => {
    server(() => respond({ error: "Invalid settings" }, 400));
    renderPanel();

    fireEvent.change(screen.getByTestId("convert-case-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("convert-case-mode-upper"));

    expect(await screen.findByTestId("convert-case-error")).toBeInTheDocument();
    expect(screen.queryByTestId("convert-case-result")).toBeNull();
  });

  it("copies the result", async () => {
    server(() => respond({ mode: "upper", result: "HI" }));
    renderPanel();

    fireEvent.change(screen.getByTestId("convert-case-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("convert-case-mode-upper"));
    await screen.findByTestId("convert-case-result");
    fireEvent.click(screen.getByTestId("convert-case-copy"));

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith("HI"));
    expect(await screen.findByRole("status")).toHaveTextContent(en.common.copied);
  });

  it("rejects a malformed success body", async () => {
    server(() => respond({ nope: true }));
    renderPanel();

    fireEvent.change(screen.getByTestId("convert-case-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("convert-case-mode-upper"));

    expect(await screen.findByTestId("convert-case-error")).toHaveTextContent(
      en.errors.invalidServerResponse,
    );
  });
});
