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

import { Base64Settings } from "@/components/tools/base64-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { track } from "@/lib/analytics";

const ROUTE = "/api/v1/tools/files/base64";
const ts = en.toolSettings.base64;

function respond(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

/** Answers the tool route with `answer`, and anything the providers fetch on mount with {}. */
function server(answer: () => Promise<Response>) {
  const tool = vi.fn(answer);
  const fetchMock = vi.fn((input: RequestInfo | URL, _init?: RequestInit) =>
    String(input).endsWith(ROUTE) ? tool() : respond({}),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, tool };
}

function toolCall(fetchMock: ReturnType<typeof server>["fetchMock"]) {
  const call = fetchMock.mock.calls.find(([input]) => String(input).endsWith(ROUTE));
  if (!call) throw new Error("tool route was never called");
  const init = call[1] as RequestInit;
  return { init, body: JSON.parse(String(init.body)) };
}

function renderPanel() {
  return render(
    <I18nProvider>
      <Base64Settings />
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

describe("base64 settings", () => {
  it("posts the text as JSON to the server and shows the encoded result", async () => {
    const { fetchMock } = server(() => respond({ mode: "encode", result: "aGk=" }));
    renderPanel();

    expect(screen.getByTestId("base64-submit")).toBeDisabled();
    fireEvent.change(screen.getByTestId("base64-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("base64-submit"));

    expect(await screen.findByTestId("base64-result")).toHaveValue("aGk=");
    const { init, body } = toolCall(fetchMock);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(body).toEqual({ text: "hi", mode: "encode", urlSafe: false });
    expect(track).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.TOOL_STARTED,
      expect.objectContaining({ tool_id: "base64" }),
    );
  });

  it("sends urlSafe only when encoding with the box ticked", async () => {
    const { fetchMock } = server(() => respond({ mode: "encode", result: "aGk" }));
    renderPanel();

    fireEvent.click(screen.getByTestId("base64-url-safe"));
    fireEvent.change(screen.getByTestId("base64-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("base64-submit"));

    await screen.findByTestId("base64-result");
    expect(toolCall(fetchMock).body.urlSafe).toBe(true);
  });

  it("decodes in decode mode and hides the URL-safe option", async () => {
    const { fetchMock } = server(() => respond({ mode: "decode", result: "hi" }));
    renderPanel();

    fireEvent.click(screen.getByTestId("base64-mode-decode"));
    expect(screen.queryByTestId("base64-url-safe")).toBeNull();
    expect(screen.getByLabelText(ts.decodeInput)).toBeInTheDocument();
    fireEvent.change(screen.getByTestId("base64-input"), { target: { value: "aGk=" } });
    fireEvent.click(screen.getByTestId("base64-submit"));

    expect(await screen.findByTestId("base64-result")).toHaveValue("hi");
    expect(toolCall(fetchMock).body).toEqual({ text: "aGk=", mode: "decode", urlSafe: false });
  });

  it.each([
    ["ENCODED_TEXT_INVALID", en.errors.codes.ENCODED_TEXT_INVALID],
    ["DECODED_DATA_NOT_TEXT", en.errors.codes.DECODED_DATA_NOT_TEXT],
  ])(
    "shows the translated reason for %s instead of the server's English",
    async (code, message) => {
      server(() => respond({ error: "server text", code }, 400));
      renderPanel();

      fireEvent.click(screen.getByTestId("base64-mode-decode"));
      fireEvent.change(screen.getByTestId("base64-input"), { target: { value: "!!" } });
      fireEvent.click(screen.getByTestId("base64-submit"));

      expect(await screen.findByTestId("base64-error")).toHaveTextContent(message);
      expect(screen.queryByTestId("base64-result")).toBeNull();
    },
  );

  it("clears the result when the direction changes", async () => {
    server(() => respond({ mode: "encode", result: "aGk=" }));
    renderPanel();

    fireEvent.change(screen.getByTestId("base64-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("base64-submit"));
    await screen.findByTestId("base64-result");

    fireEvent.click(screen.getByTestId("base64-mode-decode"));
    expect(screen.queryByTestId("base64-result")).toBeNull();
  });

  it("copies the result", async () => {
    server(() => respond({ mode: "encode", result: "aGk=" }));
    renderPanel();

    fireEvent.change(screen.getByTestId("base64-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("base64-submit"));
    await screen.findByTestId("base64-result");
    fireEvent.click(screen.getByTestId("base64-copy"));

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith("aGk="));
    expect(await screen.findByRole("status")).toHaveTextContent(en.common.copied);
  });

  it("rejects a malformed success body", async () => {
    server(() => respond({ nope: true }));
    renderPanel();

    fireEvent.change(screen.getByTestId("base64-input"), { target: { value: "hi" } });
    fireEvent.click(screen.getByTestId("base64-submit"));

    expect(await screen.findByTestId("base64-error")).toHaveTextContent(
      en.errors.invalidServerResponse,
    );
  });
});
