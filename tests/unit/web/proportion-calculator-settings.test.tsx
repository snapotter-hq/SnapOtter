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

import {
  ProportionCalculatorSettings,
  parseNumberInput,
} from "@/components/tools/proportion-calculator-settings";
import { I18nProvider } from "@/contexts/i18n-context";
import { track } from "@/lib/analytics";
import { PROPORTION_MODES } from "../../../apps/api/src/lib/proportion.js";

const ROUTE = "/api/v1/tools/files/proportion-calculator";
const ts = en.toolSettings["proportion-calculator"];

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

function toolCalls(fetchMock: ReturnType<typeof server>) {
  return fetchMock.mock.calls
    .filter(([input]) => String(input).endsWith(ROUTE))
    .map(([, init]) => ({ init: init as RequestInit, body: JSON.parse(String(init?.body)) }));
}

function renderPanel() {
  return render(
    <I18nProvider>
      <ProportionCalculatorSettings />
    </I18nProvider>,
  );
}

function type(field: "a" | "b" | "c", value: string) {
  fireEvent.change(screen.getByTestId(`proportion-${field}`), { target: { value } });
}

function fill(a: string, b: string, c: string) {
  type("a", a);
  type("b", b);
  type("c", c);
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

describe("parseNumberInput", () => {
  it.each([
    ["3", 3],
    ["-2.5", -2.5],
    ["1,5", 1.5],
    [" .5 ", 0.5],
    ["1e3", 1000],
    ["+4", 4],
    ["\u0663\u066b\u0665", 3.5],
    ["\u06f1\u06f2", 12],
    ["\u0967\u0966", 10],
  ])("reads %j as %d", (raw, value) => {
    expect(parseNumberInput(raw)).toBe(value);
  });

  it.each(["", "abc", "1,000.5", "1.2.3", "--1", "1e999", "0x10"])("refuses %j", (raw) => {
    expect(parseNumberInput(raw)).toBeNull();
  });
});

describe("proportion-calculator settings", () => {
  it("offers a labelled button for every mode the server accepts", () => {
    server(() => respond({}));
    renderPanel();
    for (const mode of PROPORTION_MODES) {
      expect(screen.getByTestId(`proportion-mode-${mode}`)).toHaveTextContent(ts[mode]);
    }
  });

  it("keeps Calculate disabled until all three values are numbers", () => {
    server(() => respond({}));
    renderPanel();
    const calc = screen.getByTestId("proportion-calculate");
    expect(calc).toBeDisabled();
    fill("3", "6", "abc");
    expect(calc).toBeDisabled();
    expect(screen.getByTestId("proportion-c")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText(ts.invalidNumber)).toBeInTheDocument();
    type("c", "10");
    expect(calc).toBeEnabled();
  });

  it("blocks a zero divisor for the current mode only", () => {
    server(() => respond({}));
    renderPanel();
    fill("0", "6", "10");
    expect(screen.getByTestId("proportion-zero")).toHaveTextContent(ts.zeroDivisorDirect);
    expect(screen.getByTestId("proportion-calculate")).toBeDisabled();

    fireEvent.click(screen.getByTestId("proportion-mode-inverse"));
    expect(screen.queryByTestId("proportion-zero")).toBeNull();
    expect(screen.getByTestId("proportion-calculate")).toBeEnabled();

    type("c", "0");
    expect(screen.getByTestId("proportion-zero")).toHaveTextContent(ts.zeroDivisorInverse);
  });

  it("posts the three numbers and mode as JSON and shows X", async () => {
    const fetchMock = server(() => respond({ mode: "direct", x: 20 }));
    renderPanel();

    fill("3", "6", "10");
    fireEvent.click(screen.getByTestId("proportion-calculate"));

    expect(await screen.findByTestId("proportion-result")).toHaveTextContent("X = 20");
    const [{ init, body }] = toolCalls(fetchMock);
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
    expect(body).toEqual({ a: 3, b: 6, c: 10, mode: "direct" });
    expect(track).toHaveBeenCalledWith(
      ANALYTICS_EVENTS.TOOL_STARTED,
      expect.objectContaining({ tool_id: "proportion-calculator" }),
    );
  });

  it("sends a comma decimal as a number and the inverse mode when picked", async () => {
    const fetchMock = server(() => respond({ mode: "inverse", x: 3 }));
    renderPanel();

    fireEvent.click(screen.getByTestId("proportion-mode-inverse"));
    fill("1,5", "6", "3");
    fireEvent.submit(screen.getByTestId("proportion-calculate"));

    await screen.findByTestId("proportion-result");
    expect(toolCalls(fetchMock)[0].body).toEqual({ a: 1.5, b: 6, c: 3, mode: "inverse" });
  });

  it("ties the formula hint to every input", () => {
    server(() => respond({}));
    renderPanel();
    for (const f of ["a", "b", "c"]) {
      expect(screen.getByTestId(`proportion-${f}`)).toHaveAccessibleDescription(ts.directHint);
    }
  });

  it("clears the result when a value changes", async () => {
    server(() => respond({ mode: "direct", x: 20 }));
    renderPanel();

    fill("3", "6", "10");
    fireEvent.click(screen.getByTestId("proportion-calculate"));
    await screen.findByTestId("proportion-result");

    type("c", "11");
    expect(screen.queryByTestId("proportion-result")).toBeNull();
  });

  it("shows an error and no result when the request fails", async () => {
    server(() => respond({ error: "Invalid settings" }, 400));
    renderPanel();

    fill("3", "6", "10");
    fireEvent.click(screen.getByTestId("proportion-calculate"));

    expect(await screen.findByTestId("proportion-error")).toBeInTheDocument();
    expect(screen.queryByTestId("proportion-result")).toBeNull();
  });

  it("rejects a malformed success body", async () => {
    server(() => respond({ x: "20" }));
    renderPanel();

    fill("3", "6", "10");
    fireEvent.click(screen.getByTestId("proportion-calculate"));

    expect(await screen.findByTestId("proportion-error")).toHaveTextContent(
      en.errors.invalidServerResponse,
    );
  });

  it("copies X and counts the copy as the result being taken", async () => {
    server(() => respond({ mode: "direct", x: 0.1 }));
    renderPanel();

    fill("3", "0.1", "3");
    fireEvent.click(screen.getByTestId("proportion-calculate"));
    await screen.findByTestId("proportion-result");
    fireEvent.click(screen.getByTestId("proportion-copy"));

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith("0.1"));
    expect(track).toHaveBeenCalledWith(ANALYTICS_EVENTS.RESULT_DOWNLOADED, {
      tool_id: "proportion-calculator",
    });
    expect(await screen.findByText(en.common.copied)).toBeInTheDocument();
  });
});
