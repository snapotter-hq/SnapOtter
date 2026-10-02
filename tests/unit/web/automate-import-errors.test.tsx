// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { en } from "@snapotter/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

import { I18nProvider } from "@/contexts/i18n-context";
import { AutomatePage } from "@/pages/automate-page";
import { useFileStore } from "@/stores/file-store";
import { usePipelineStore } from "@/stores/pipeline-store";

/**
 * Importing a pipeline file reads the file, saves it, then refreshes the
 * saved list. Each of those can fail on its own, and the message has to name
 * the one that did (#1956): a dropped connection on the save is not a bad
 * file, and a list refresh that fails after a good save must say so instead
 * of leaving the new pipeline invisible until a reload.
 */

const PIPELINE = {
  format: "snapotter-pipeline",
  version: 1,
  name: "Imported",
  steps: [{ toolId: "resize", settings: {} }],
};

const SAVED = {
  id: "p1",
  name: "Imported",
  description: null,
  steps: PIPELINE.steps,
  createdAt: "2026-10-02T00:00:00.000Z",
};

type Answer = Response | "network-down";

interface Server {
  /** Answers every pipeline/list request after the first (the page's own load). */
  list: () => Answer;
  save: () => Answer;
}

let server: Server;

function respond(answer: Answer): Response {
  if (answer === "network-down") throw new TypeError("Failed to fetch");
  return answer;
}

const storageMap = new Map<string, string>();

beforeEach(() => {
  storageMap.clear();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => storageMap.get(key) ?? null,
    setItem: (key: string, value: string) => storageMap.set(key, value),
    removeItem: (key: string) => storageMap.delete(key),
    clear: () => storageMap.clear(),
    key: () => null,
    get length() {
      return storageMap.size;
    },
  });
  useFileStore.getState().reset();
  usePipelineStore.setState({ savedPipelines: [] });
  let listCalls = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/pipeline/list")) {
        listCalls += 1;
        if (listCalls === 1) return new Response(JSON.stringify({ pipelines: [] }));
        return respond(server.list());
      }
      if (url.includes("/pipeline/save")) return respond(server.save());
      return new Response("{}", { status: 404 });
    }),
  );
});

afterEach(() => {
  cleanup();
  useFileStore.getState().reset();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Lands on /automate and picks a file with the given contents to import. */
async function importFile(contents: string): Promise<void> {
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
  fireEvent.click(await screen.findByRole("button", { name: en.automate.importButton }));
  const input = created.at(-1);
  if (!input) throw new Error("import created no file input");
  const file = new File([contents], "p.snapotter.json", { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file] });
  input.onchange?.({ target: input } as unknown as Event);
}

const savedOk = () => new Response(JSON.stringify({ id: "p1" }), { status: 201 });
const listOk = () => new Response(JSON.stringify({ pipelines: [SAVED] }));

describe("automate pipeline import (#1956)", () => {
  it("calls a save that never reached the server a network error, not a bad file", async () => {
    server = { save: () => "network-down", list: listOk };
    await importFile(JSON.stringify(PIPELINE));
    await waitFor(() => expect(screen.getByText(en.errors.networkError)).toBeInTheDocument());
    expect(screen.queryByText(en.automate.couldNotRead)).not.toBeInTheDocument();
  });

  it("says the list didn't refresh when the save worked but the list answered non-2xx", async () => {
    server = { save: savedOk, list: () => new Response("busy", { status: 503 }) };
    await importFile(JSON.stringify(PIPELINE));
    await waitFor(() =>
      expect(screen.getByText(en.automate.importListRefreshFailed)).toBeInTheDocument(),
    );
    expect(screen.queryByText(en.automate.couldNotRead)).not.toBeInTheDocument();
  });

  it("says the list didn't refresh when the list request itself never got through", async () => {
    server = { save: savedOk, list: () => "network-down" };
    await importFile(JSON.stringify(PIPELINE));
    await waitFor(() =>
      expect(screen.getByText(en.automate.importListRefreshFailed)).toBeInTheDocument(),
    );
    expect(screen.queryByText(en.errors.networkError)).not.toBeInTheDocument();
  });

  it("says the list didn't refresh when the list answer is not JSON", async () => {
    server = { save: savedOk, list: () => new Response("<html>proxy</html>") };
    await importFile(JSON.stringify(PIPELINE));
    await waitFor(() =>
      expect(screen.getByText(en.automate.importListRefreshFailed)).toBeInTheDocument(),
    );
  });

  it("shows the imported pipeline and no error when save and refresh both work", async () => {
    server = { save: savedOk, list: listOk };
    await importFile(JSON.stringify(PIPELINE));
    await waitFor(() => expect(usePipelineStore.getState().savedPipelines).toHaveLength(1));
    expect(screen.queryByText(en.automate.importListRefreshFailed)).not.toBeInTheDocument();
    expect(screen.queryByText(en.errors.networkError)).not.toBeInTheDocument();
    expect(screen.queryByText(en.automate.couldNotRead)).not.toBeInTheDocument();
  });

  it("still calls a file that isn't JSON unreadable", async () => {
    server = { save: savedOk, list: listOk };
    await importFile("{ not json");
    await waitFor(() => expect(screen.getByText(en.automate.couldNotRead)).toBeInTheDocument());
  });

  it.each([
    ["null", "null"],
    ["a number", "42"],
    ["an array", "[]"],
  ])("calls a JSON file holding %s an invalid pipeline file", async (_label, contents) => {
    server = { save: savedOk, list: listOk };
    await importFile(contents);
    await waitFor(() =>
      expect(screen.getByText(en.automate.invalidPipelineFile)).toBeInTheDocument(),
    );
  });
});
